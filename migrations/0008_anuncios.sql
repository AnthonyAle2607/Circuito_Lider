-- 0008 · Anuncios (spots) y su revisión (PT-6, 2026-11-19).
-- El cliente sube su archivo; un trabajo mide la duración, lo transcribe y busca palabras prohibidas; lo que no queda
-- claro lo decide una persona del equipo. Reglas en config/spots.yaml (40 s; una palabra prohibida → revisión).

CREATE TYPE estado_anuncio AS ENUM ('procesando', 'aprobado', 'en_revision', 'rechazado');

CREATE TABLE anuncios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anunciante_id   uuid NOT NULL REFERENCES anunciantes(id),
  subido_por      uuid NOT NULL REFERENCES usuarios(id),
  nombre          text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 120),
  archivo_nombre  text NOT NULL CHECK (length(archivo_nombre) BETWEEN 1 AND 200),
  archivo_clave   text NOT NULL UNIQUE CHECK (length(archivo_clave) BETWEEN 1 AND 300),
  formato         text NOT NULL CHECK (formato IN ('mp4', 'mp3', 'wav')),
  bytes           integer NOT NULL CHECK (bytes > 0),
  duracion_ms     integer CHECK (duracion_ms >= 0),
  estado          estado_anuncio NOT NULL DEFAULT 'procesando',
  motivo          text CHECK (length(motivo) <= 1000),
  transcripcion   text CHECK (length(transcripcion) <= 20000),
  coincidencias   jsonb NOT NULL DEFAULT '[]'::jsonb,
  intentos        integer NOT NULL DEFAULT 0,
  tomado_at       timestamptz,
  revisado_por    uuid REFERENCES equipo(id),
  revisado_at     timestamptz,
  creado_at       timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX anuncios_anunciante_idx ON anuncios (anunciante_id, creado_at DESC);
CREATE INDEX anuncios_estado_idx ON anuncios (estado, creado_at);

ALTER TABLE anuncios ENABLE ROW LEVEL SECURITY;
CREATE POLICY propio ON anuncios USING (anunciante_id = app_anunciante_id()) WITH CHECK (anunciante_id = app_anunciante_id());

-- Lista de palabras prohibidas: se carga desde datos/palabras-prohibidas.yaml y el equipo la edita después.
CREATE TABLE palabras_prohibidas (
  id         serial PRIMARY KEY,
  palabra    text NOT NULL UNIQUE CHECK (length(palabra) BETWEEN 1 AND 80),
  categoria  text NOT NULL CHECK (length(categoria) BETWEEN 1 AND 40),
  activa     boolean NOT NULL DEFAULT true,
  creado_at  timestamptz NOT NULL DEFAULT now()
);

-- ── trabajo de revisión (rol app_worker) ────────────────────────────────────
-- Toma el siguiente anuncio por procesar, de cualquier cuenta, sin que dos trabajadores tomen el mismo. Uno tomado
-- hace más de 10 minutos (el trabajador se cayó) se puede volver a tomar; tras 3 intentos queda para una persona.
CREATE FUNCTION tomar_anuncio_pendiente() RETURNS TABLE (id uuid, anunciante_id uuid, archivo_clave text, formato text, intentos integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE anuncios a SET estado = 'en_revision', motivo = 'No se pudo revisar automáticamente: una persona lo escucha.', actualizado_at = now()
   WHERE a.estado = 'procesando' AND a.intentos >= 3 AND a.tomado_at < now() - interval '10 minutes';
  RETURN QUERY
  UPDATE anuncios a SET intentos = a.intentos + 1, tomado_at = now(), actualizado_at = now()
   WHERE a.id = (
     SELECT x.id FROM anuncios x
      WHERE x.estado = 'procesando' AND x.intentos < 3 AND (x.tomado_at IS NULL OR x.tomado_at < now() - interval '10 minutes')
      ORDER BY x.creado_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1)
  RETURNING a.id, a.anunciante_id, a.archivo_clave, a.formato, a.intentos;
END $$;

-- Guarda el resultado de la revisión automática. Solo sobre un anuncio todavía «procesando».
CREATE FUNCTION resolver_anuncio(p_id uuid, p_estado estado_anuncio, p_motivo text, p_duracion_ms integer, p_transcripcion text, p_coincidencias jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_anunciante uuid;
BEGIN
  IF p_estado = 'procesando' THEN RAISE EXCEPTION 'resolver_anuncio necesita un estado final'; END IF;
  UPDATE anuncios SET estado = p_estado, motivo = p_motivo, duracion_ms = p_duracion_ms, transcripcion = p_transcripcion,
         coincidencias = coalesce(p_coincidencias, '[]'::jsonb), actualizado_at = now()
   WHERE id = p_id AND estado = 'procesando'
  RETURNING anunciante_id INTO v_anunciante;
  IF v_anunciante IS NULL THEN RETURN false; END IF;
  INSERT INTO bitacora (anunciante_id, actor_tipo, actor_nombre, accion, entidad, entidad_id, datos)
    VALUES (v_anunciante, 'sistema', 'revisar-anuncios', 'anuncio.revisado', 'anuncio', p_id::text,
            jsonb_build_object('estado', p_estado, 'duracion_ms', p_duracion_ms, 'coincidencias', jsonb_array_length(coalesce(p_coincidencias, '[]'::jsonb))));
  INSERT INTO outbox (anunciante_id, tipo, datos) VALUES (v_anunciante, 'anuncio.revisado', jsonb_build_object('anuncio_id', p_id, 'estado', p_estado));
  RETURN true;
END $$;

-- ── revisión humana (equipo con rol revisor) ────────────────────────────────
-- La API del panel no fija cuenta (el equipo ve todas): estas funciones son la única puerta a los anuncios de todos.
CREATE FUNCTION anuncios_en_revision() RETURNS TABLE (
  id uuid, anunciante_id uuid, empresa text, nombre text, archivo_nombre text, archivo_clave text, formato text,
  duracion_ms integer, motivo text, transcripcion text, coincidencias jsonb, creado_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.anunciante_id, n.empresa, a.nombre, a.archivo_nombre, a.archivo_clave, a.formato, a.duracion_ms, a.motivo,
         a.transcripcion, a.coincidencias, a.creado_at
    FROM anuncios a JOIN anunciantes n ON n.id = a.anunciante_id
   WHERE a.estado = 'en_revision'
   ORDER BY a.creado_at
   LIMIT 200
$$;

CREATE FUNCTION decidir_anuncio(p_id uuid, p_aprobar boolean, p_motivo text, p_equipo uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_anunciante uuid;
BEGIN
  UPDATE anuncios SET estado = CASE WHEN p_aprobar THEN 'aprobado'::estado_anuncio ELSE 'rechazado'::estado_anuncio END,
         motivo = p_motivo, revisado_por = p_equipo, revisado_at = now(), actualizado_at = now()
   WHERE id = p_id AND estado = 'en_revision'
  RETURNING anunciante_id INTO v_anunciante;
  IF v_anunciante IS NOT NULL THEN
    INSERT INTO outbox (anunciante_id, tipo, datos)
      VALUES (v_anunciante, 'anuncio.revisado', jsonb_build_object('anuncio_id', p_id, 'estado', CASE WHEN p_aprobar THEN 'aprobado' ELSE 'rechazado' END));
  END IF;
  RETURN v_anunciante;
END $$;

-- Para escuchar el archivo en el panel: solo da la clave de un anuncio que está esperando revisión.
CREATE FUNCTION archivo_de_anuncio_en_revision(p_id uuid) RETURNS TABLE (archivo_clave text, formato text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT archivo_clave, formato FROM anuncios WHERE id = p_id AND estado = 'en_revision'
$$;

REVOKE ALL ON FUNCTION tomar_anuncio_pendiente(), resolver_anuncio(uuid, estado_anuncio, text, integer, text, jsonb),
  anuncios_en_revision(), decidir_anuncio(uuid, boolean, text, uuid), archivo_de_anuncio_en_revision(uuid) FROM PUBLIC;

-- ── permisos ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON anuncios TO app_api;
GRANT SELECT ON palabras_prohibidas TO app_api, app_worker;
GRANT EXECUTE ON FUNCTION anuncios_en_revision(), decidir_anuncio(uuid, boolean, text, uuid), archivo_de_anuncio_en_revision(uuid) TO app_api;
GRANT EXECUTE ON FUNCTION tomar_anuncio_pendiente(), resolver_anuncio(uuid, estado_anuncio, text, integer, text, jsonb) TO app_worker;
