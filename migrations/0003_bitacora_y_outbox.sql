-- 0003 · Bitácora encadenada (invariantes P7 y P12) y outbox de eventos (decisión D7).
-- Patrón de ContentSniper (migraciones 0001 y 0031): cada fila guarda el hash de la anterior; el hash se calcula en UTC
-- y estilo ISO dentro de la función, para que no dependa de la sesión que escribe.

CREATE TYPE tipo_actor AS ENUM ('anunciante', 'equipo', 'agente', 'sistema');

CREATE TABLE bitacora (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anunciante_id  uuid REFERENCES anunciantes(id),
  actor_tipo     tipo_actor NOT NULL,
  actor_id       uuid,                                    -- usuario o miembro del equipo
  actor_nombre   text CHECK (actor_nombre IS NULL OR length(actor_nombre) <= 120),  -- agente o proceso
  accion         text NOT NULL CHECK (length(accion) BETWEEN 1 AND 100),
  entidad        text NOT NULL CHECK (length(entidad) BETWEEN 1 AND 60),
  entidad_id     text NOT NULL CHECK (length(entidad_id) BETWEEN 1 AND 100),
  datos          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip             inet,
  hash_prev      bytea,
  hash           bytea NOT NULL,
  ts             timestamptz NOT NULL
);
CREATE INDEX bitacora_entidad_idx ON bitacora (entidad, entidad_id);
CREATE INDEX bitacora_anunciante_idx ON bitacora (anunciante_id, id);

-- SECURITY DEFINER: el trigger lee el último hash aunque quien escribe (app_worker) solo pueda insertar.
CREATE FUNCTION bitacora_encadenar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET TimeZone = 'UTC' SET DateStyle = 'ISO, MDY' AS $$
DECLARE
  anterior bytea;
BEGIN
  -- Serializa las inserciones para que la cadena no se bifurque.
  PERFORM pg_advisory_xact_lock(hashtext('bitacora'));
  SELECT hash INTO anterior FROM bitacora ORDER BY id DESC LIMIT 1;
  NEW.ts := clock_timestamp();
  NEW.hash_prev := anterior;
  NEW.hash := sha256(
    coalesce(anterior, ''::bytea) ||
    convert_to(concat_ws('|',
      NEW.anunciante_id, NEW.actor_tipo, NEW.actor_id, NEW.actor_nombre, NEW.accion, NEW.entidad, NEW.entidad_id,
      NEW.datos::text, NEW.ip, NEW.ts), 'UTF8')
  );
  RETURN NEW;
END $$;
CREATE TRIGGER bitacora_encadenar BEFORE INSERT ON bitacora FOR EACH ROW EXECUTE FUNCTION bitacora_encadenar();

CREATE FUNCTION solo_anadir() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo añadir (invariante P7)', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER bitacora_sin_cambios BEFORE UPDATE OR DELETE ON bitacora FOR EACH ROW EXECUTE FUNCTION solo_anadir();
CREATE TRIGGER bitacora_sin_truncar BEFORE TRUNCATE ON bitacora FOR EACH STATEMENT EXECUTE FUNCTION solo_anadir();

-- Recalcula la cadena desde la fila `p_desde` (0 = toda). Devuelve cuántas filas revisó y la primera rota
-- (alterada, o con el enlace al hash anterior roto por un borrado), o NULL si está íntegra.
CREATE FUNCTION bitacora_verificar(p_desde bigint DEFAULT 0) RETURNS TABLE (filas bigint, primera_rota bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET TimeZone = 'UTC' SET DateStyle = 'ISO, MDY' AS $$
  WITH f AS (
    SELECT id, hash, hash_prev,
           lag(hash) OVER (ORDER BY id) AS previo,
           sha256(coalesce(hash_prev, ''::bytea) || convert_to(concat_ws('|',
             anunciante_id, actor_tipo, actor_id, actor_nombre, accion, entidad, entidad_id, datos::text, ip, ts), 'UTF8')) AS recalculado
      FROM bitacora
  ), r AS (SELECT * FROM f WHERE id >= p_desde)
  SELECT count(*)::bigint, min(id) FILTER (WHERE recalculado <> hash OR hash_prev IS DISTINCT FROM previo) FROM r
$$;
REVOKE ALL ON FUNCTION bitacora_verificar(bigint) FROM PUBLIC;

-- ── outbox ──────────────────────────────────────────────────────────────────
-- Cada cambio de estado deja su evento en la MISMA transacción; el despachador (trabajos) lo reparte después.
-- Si `datos` lleva algo sensible para un aviso (el enlace de verificación), el despachador lo borra al enviarlo.
CREATE TABLE outbox (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anunciante_id  uuid REFERENCES anunciantes(id),
  tipo           text NOT NULL CHECK (tipo ~ '^[a-z_]+\.[a-z_]+$'),
  datos          jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_at      timestamptz NOT NULL DEFAULT now(),
  despachado_at  timestamptz,
  intentos       integer NOT NULL DEFAULT 0,
  ultimo_error   text CHECK (ultimo_error IS NULL OR length(ultimo_error) <= 2000)
);
CREATE INDEX outbox_pendientes_idx ON outbox (id) WHERE despachado_at IS NULL;

-- ── Permisos mínimos ────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON bitacora TO app_api;
GRANT INSERT ON bitacora TO app_worker;
GRANT EXECUTE ON FUNCTION bitacora_verificar(bigint) TO app_api;
GRANT INSERT ON outbox TO app_api, app_worker;
GRANT SELECT ON outbox TO app_worker;
GRANT UPDATE (despachado_at, intentos, ultimo_error, datos) ON outbox TO app_worker;
