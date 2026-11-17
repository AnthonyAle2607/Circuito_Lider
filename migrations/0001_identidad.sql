-- 0001 · Identidad: anunciantes, sus usuarios, el equipo de Invermedia y las sesiones.
--
-- Roles: el migrador (dueño de todas las tablas) es el superusuario de la base en el servidor propio. La aplicación usa
-- roles sin privilegios ni BYPASSRLS: `app_api` (servidor principal) y `app_worker` (trabajos). Las claves de esos roles
-- se fijan fuera de las migraciones (en desarrollo, scripts/iniciar.mjs; en producción, el runbook del servidor).
--
-- Aislamiento (invariante de la arquitectura D5): todo lo que pertenece a un anunciante lleva `anunciante_id` y una
-- política RLS que lo compara con `app.anunciante_id`, que fija withTenant() solo dentro de la transacción.

CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    CREATE ROLE app_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker') THEN
    CREATE ROLE app_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO app_api, app_worker;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE TYPE estado_cuenta AS ENUM ('activa', 'suspendida', 'cerrada');
CREATE TYPE rol_equipo    AS ENUM ('ventas', 'revisor', 'programacion', 'finanzas', 'gerencia', 'admin');
CREATE TYPE tipo_sesion   AS ENUM ('anunciante', 'equipo');

-- El anunciante de la transacción en curso, o NULL si no hay (entonces ninguna fila pasa la política).
CREATE FUNCTION app_anunciante_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.anunciante_id', true), '')::uuid
$$;

-- ── anunciantes ─────────────────────────────────────────────────────────────
CREATE TABLE anunciantes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa       text NOT NULL CHECK (length(empresa) BETWEEN 1 AND 200),
  pais          char(2) NOT NULL CHECK (pais ~ '^[A-Z]{2}$'),
  zona_horaria  text NOT NULL DEFAULT 'America/Caracas' CHECK (length(zona_horaria) BETWEEN 1 AND 64),
  estado        estado_cuenta NOT NULL DEFAULT 'activa',
  creado_at     timestamptz NOT NULL DEFAULT now()
);

-- ── usuarios del anunciante ─────────────────────────────────────────────────
CREATE TABLE usuarios (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anunciante_id         uuid NOT NULL REFERENCES anunciantes(id),
  email                 citext NOT NULL UNIQUE CHECK (length(email) <= 254),
  nombre                text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 200),
  password_hash         text NOT NULL,              -- Argon2id
  correo_verificado_at  timestamptz,
  estado                estado_cuenta NOT NULL DEFAULT 'activa',
  ultimo_acceso_at      timestamptz,
  creado_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usuarios_anunciante_idx ON usuarios (anunciante_id);

-- Enlace de verificación de correo: se guarda el hash del código, nunca el código.
CREATE TABLE verificaciones_correo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anunciante_id  uuid NOT NULL REFERENCES anunciantes(id),
  usuario_id     uuid NOT NULL REFERENCES usuarios(id),
  codigo_hash    bytea NOT NULL UNIQUE CHECK (octet_length(codigo_hash) = 32),
  expira_at      timestamptz NOT NULL,
  usado_at       timestamptz,
  creado_at      timestamptz NOT NULL DEFAULT now()
);

-- ── equipo de Invermedia ────────────────────────────────────────────────────
-- Doble factor obligatorio: sin TOTP verificado no se entra al panel. El alta la hace un script con el rol migrador.
CREATE TABLE equipo (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 citext NOT NULL UNIQUE CHECK (length(email) <= 254),
  nombre                text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 200),
  password_hash         text NOT NULL,
  roles                 rol_equipo[] NOT NULL CHECK (cardinality(roles) >= 1),
  totp_secreto_cifrado  bytea NOT NULL,             -- AES-256-GCM con la llave MFA_KEY del servidor
  totp_ultimo_paso      bigint NOT NULL DEFAULT 0,  -- impide reutilizar un código ya usado
  activo                boolean NOT NULL DEFAULT true,
  ultimo_acceso_at      timestamptz,
  creado_at             timestamptz NOT NULL DEFAULT now()
);

-- Clave correcta, falta el código: el reto vive pocos minutos y admite pocos intentos.
CREATE TABLE retos_equipo (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reto_hash  bytea NOT NULL UNIQUE CHECK (octet_length(reto_hash) = 32),
  equipo_id  uuid NOT NULL REFERENCES equipo(id),
  intentos   integer NOT NULL DEFAULT 0,
  expira_at  timestamptz NOT NULL,
  usado_at   timestamptz,
  creado_at  timestamptz NOT NULL DEFAULT now()
);

-- ── sesiones ────────────────────────────────────────────────────────────────
-- Se guarda el hash del token. Una sesión es de un usuario de un anunciante o de un miembro del equipo, nunca de ambos.
CREATE TABLE sesiones (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash             bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  tipo                   tipo_sesion NOT NULL,
  usuario_id             uuid REFERENCES usuarios(id),
  anunciante_id          uuid REFERENCES anunciantes(id),
  equipo_id              uuid REFERENCES equipo(id),
  creada_at              timestamptz NOT NULL DEFAULT now(),
  ultimo_uso_at          timestamptz NOT NULL DEFAULT now(),
  expira_inactividad_at  timestamptz NOT NULL,
  expira_absoluta_at     timestamptz NOT NULL,
  revocada_at            timestamptz,
  ip                     inet,
  user_agent             text CHECK (user_agent IS NULL OR length(user_agent) <= 512),
  CHECK (
    (tipo = 'anunciante' AND usuario_id IS NOT NULL AND anunciante_id IS NOT NULL AND equipo_id IS NULL) OR
    (tipo = 'equipo' AND equipo_id IS NOT NULL AND usuario_id IS NULL AND anunciante_id IS NULL)
  )
);

-- «Una persona nunca se borra: se suspende.»
CREATE FUNCTION no_se_borra() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'En % no se borra: se suspende', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER usuarios_sin_borrar BEFORE DELETE ON usuarios FOR EACH ROW EXECUTE FUNCTION no_se_borra();
CREATE TRIGGER equipo_sin_borrar   BEFORE DELETE ON equipo   FOR EACH ROW EXECUTE FUNCTION no_se_borra();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE anunciantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY propio ON anunciantes USING (id = app_anunciante_id()) WITH CHECK (id = app_anunciante_id());

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY propio ON usuarios
  USING (anunciante_id = app_anunciante_id()) WITH CHECK (anunciante_id = app_anunciante_id());

ALTER TABLE verificaciones_correo ENABLE ROW LEVEL SECURITY;
CREATE POLICY propio ON verificaciones_correo
  USING (anunciante_id = app_anunciante_id()) WITH CHECK (anunciante_id = app_anunciante_id());

-- ── Lo que ocurre antes de saber quién es el anunciante ────────────────────
-- El ingreso busca por correo y la verificación por código: todavía no hay anunciante en el contexto. Estas funciones
-- devuelven solo lo imprescindible y corren con los permisos del dueño (SECURITY DEFINER), con search_path fijo.

CREATE FUNCTION buscar_usuario_para_ingreso(p_email citext)
RETURNS TABLE (id uuid, anunciante_id uuid, nombre text, password_hash text, correo_verificado boolean, activo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.anunciante_id, u.nombre, u.password_hash, u.correo_verificado_at IS NOT NULL,
         u.estado = 'activa' AND a.estado = 'activa'
    FROM usuarios u JOIN anunciantes a ON a.id = u.anunciante_id
   WHERE u.email = p_email
$$;

-- Marca el correo como verificado si el código existe, no venció y no se usó. Devuelve el usuario y su anunciante
-- (para la bitácora), o ninguna fila.
CREATE FUNCTION verificar_correo(p_codigo_hash bytea) RETURNS TABLE (usuario_id uuid, anunciante_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_usuario uuid;
  v_anunciante uuid;
BEGIN
  UPDATE verificaciones_correo v SET usado_at = now()
   WHERE v.codigo_hash = p_codigo_hash AND v.usado_at IS NULL AND v.expira_at > now()
  RETURNING v.usuario_id, v.anunciante_id INTO v_usuario, v_anunciante;
  IF v_usuario IS NOT NULL THEN
    UPDATE usuarios u SET correo_verificado_at = coalesce(u.correo_verificado_at, now()) WHERE u.id = v_usuario;
    RETURN QUERY SELECT v_usuario, v_anunciante;
  END IF;
END $$;

REVOKE ALL ON FUNCTION buscar_usuario_para_ingreso(citext), verificar_correo(bytea) FROM PUBLIC;

-- ── Permisos mínimos ────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION buscar_usuario_para_ingreso(citext), verificar_correo(bytea) TO app_api;
GRANT SELECT, INSERT ON anunciantes, usuarios, verificaciones_correo TO app_api;
GRANT UPDATE (ultimo_acceso_at) ON usuarios TO app_api;
GRANT SELECT ON equipo TO app_api;
GRANT UPDATE (totp_ultimo_paso, ultimo_acceso_at) ON equipo TO app_api;
GRANT SELECT, INSERT ON retos_equipo TO app_api;
GRANT UPDATE (intentos, usado_at) ON retos_equipo TO app_api;
GRANT SELECT, INSERT ON sesiones TO app_api;
GRANT UPDATE (ultimo_uso_at, expira_inactividad_at, revocada_at) ON sesiones TO app_api;
