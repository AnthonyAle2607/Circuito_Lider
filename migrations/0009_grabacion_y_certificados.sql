-- 0009 · Grabación de las emisoras y certificados de emisión (PT-7, 2026-11-19).
-- El grabador guarda cada emisora en bloques (64 kbps, tal cual llega del streaming) y los anota aquí. Un trabajo
-- busca en cada bloque, con la huella acústica, los spots que debían sonar en sus franjas; cada hallazgo es un
-- certificado: hora exacta, emisora y el recorte del audio. Los audios completos se borran al mes; los certificados,
-- nunca (decisión de Anthony, 2026-11-18).

-- ── grabaciones ─────────────────────────────────────────────────────────────
CREATE TABLE grabaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emisora_id    uuid NOT NULL REFERENCES emisoras(id),
  archivo       text NOT NULL UNIQUE CHECK (length(archivo) BETWEEN 1 AND 300),   -- relativo a GRABACIONES_DIR
  inicio_at     timestamptz NOT NULL,
  fin_at        timestamptz NOT NULL CHECK (fin_at > inicio_at),
  bytes         bigint NOT NULL CHECK (bytes >= 0),
  analizada_at  timestamptz,
  borrada_at    timestamptz,
  creado_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX grabaciones_pendientes_idx ON grabaciones (fin_at) WHERE analizada_at IS NULL;
CREATE INDEX grabaciones_emisora_idx ON grabaciones (emisora_id, inicio_at);

-- ── el anuncio que suena en cada pedido ─────────────────────────────────────
ALTER TABLE pedidos ADD COLUMN anuncio_id uuid REFERENCES anuncios(id);

-- ── certificados: inmutables ────────────────────────────────────────────────
CREATE TABLE certificados (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anunciante_id  uuid NOT NULL REFERENCES anunciantes(id),
  pedido_id      uuid NOT NULL REFERENCES pedidos(id),
  anuncio_id     uuid NOT NULL REFERENCES anuncios(id),
  reserva_id     uuid REFERENCES reservas(id),
  emisora_id     uuid NOT NULL REFERENCES emisoras(id),
  grabacion_id   uuid NOT NULL REFERENCES grabaciones(id),
  emitido_at     timestamptz NOT NULL,                       -- cuándo empezó a sonar el spot
  duracion_ms    integer NOT NULL CHECK (duracion_ms > 0),
  parecido       numeric(4,3) NOT NULL CHECK (parecido BETWEEN 0 AND 1),  -- 1 = idéntico a la huella del spot
  clip_clave     text NOT NULL CHECK (length(clip_clave) BETWEEN 1 AND 300),
  clip_sha256    bytea NOT NULL CHECK (length(clip_sha256) = 32),
  creado_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX certificados_anunciante_idx ON certificados (anunciante_id, emitido_at DESC);
CREATE INDEX certificados_pedido_idx ON certificados (pedido_id);
CREATE TRIGGER certificados_sin_cambios BEFORE UPDATE OR DELETE ON certificados FOR EACH ROW EXECUTE FUNCTION solo_anadir();
CREATE TRIGGER certificados_sin_truncar BEFORE TRUNCATE ON certificados FOR EACH STATEMENT EXECUTE FUNCTION solo_anadir();
ALTER TABLE certificados ENABLE ROW LEVEL SECURITY;
CREATE POLICY propio ON certificados USING (anunciante_id = app_anunciante_id());

-- ── qué buscar en un bloque grabado ─────────────────────────────────────────
-- Los spots aprobados de pedidos vigentes cuyas franjas (de esa emisora, o en cadena) se cruzan con el bloque. La hora
-- de la franja es de Caracas; se devuelve en instantes para compararla con la grabación.
CREATE FUNCTION candidatos_de_grabacion(p_grabacion uuid) RETURNS TABLE (
  pedido_id uuid, anunciante_id uuid, anuncio_id uuid, reserva_id uuid, archivo_clave text, formato text,
  desde timestamptz, hasta timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH g AS (SELECT * FROM grabaciones WHERE id = p_grabacion)
  SELECT p.id, p.anunciante_id, a.id, r.id, a.archivo_clave, a.formato,
         greatest(g.inicio_at, (r.fecha + f.hora_inicio) AT TIME ZONE 'America/Caracas'),
         least(g.fin_at, (r.fecha + f.hora_fin) AT TIME ZONE 'America/Caracas')
    FROM g
    JOIN reservas r ON r.estado <> 'liberada'
    JOIN pedidos p ON p.id = r.pedido_id AND p.estado IN ('reservado', 'pagado') AND p.anuncio_id IS NOT NULL
    JOIN anuncios a ON a.id = p.anuncio_id AND a.estado = 'aprobado'
    JOIN franjas f ON f.id = r.franja_id
    JOIN programas pr ON pr.id = f.programa_id AND (pr.emisora_id IS NULL OR pr.emisora_id = g.emisora_id)
   WHERE (r.fecha + f.hora_inicio) AT TIME ZONE 'America/Caracas' < g.fin_at
     AND (r.fecha + f.hora_fin) AT TIME ZONE 'America/Caracas' > g.inicio_at
$$;

-- Guarda un certificado. No duplica: si ya hay uno del mismo spot en la misma emisora a menos de un minuto (bloques
-- que se solapan, o el trabajo que se repite), no hace nada y devuelve NULL.
CREATE FUNCTION certificar_emision(
  p_pedido uuid, p_anuncio uuid, p_reserva uuid, p_grabacion uuid, p_emitido_at timestamptz, p_duracion_ms integer,
  p_parecido numeric, p_clip_clave text, p_clip_sha256 bytea) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_anunciante uuid; v_emisora uuid;
BEGIN
  SELECT p.anunciante_id INTO v_anunciante FROM pedidos p WHERE p.id = p_pedido AND p.anuncio_id = p_anuncio;
  IF v_anunciante IS NULL THEN RAISE EXCEPTION 'el anuncio no es el del pedido'; END IF;
  SELECT emisora_id INTO v_emisora FROM grabaciones WHERE id = p_grabacion;
  IF EXISTS (SELECT 1 FROM certificados c WHERE c.anuncio_id = p_anuncio AND c.emisora_id = v_emisora
              AND abs(extract(epoch FROM c.emitido_at - p_emitido_at)) < 60) THEN
    RETURN NULL;
  END IF;
  INSERT INTO certificados (anunciante_id, pedido_id, anuncio_id, reserva_id, emisora_id, grabacion_id, emitido_at, duracion_ms, parecido, clip_clave, clip_sha256)
    VALUES (v_anunciante, p_pedido, p_anuncio, p_reserva, v_emisora, p_grabacion, p_emitido_at, p_duracion_ms, p_parecido, p_clip_clave, p_clip_sha256)
    RETURNING id INTO v_id;
  INSERT INTO bitacora (anunciante_id, actor_tipo, actor_nombre, accion, entidad, entidad_id, datos)
    VALUES (v_anunciante, 'sistema', 'detectar-emisiones', 'emision.certificada', 'certificado', v_id::text,
            jsonb_build_object('emisora_id', v_emisora, 'emitido_at', p_emitido_at, 'clip_sha256', encode(p_clip_sha256, 'hex')));
  INSERT INTO outbox (anunciante_id, tipo, datos) VALUES (v_anunciante, 'emision.certificada', jsonb_build_object('certificado_id', v_id));
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION candidatos_de_grabacion(uuid), certificar_emision(uuid, uuid, uuid, uuid, timestamptz, integer, numeric, text, bytea) FROM PUBLIC;

-- ── permisos ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON grabaciones TO app_worker;
GRANT UPDATE (analizada_at, borrada_at) ON grabaciones TO app_worker;
GRANT EXECUTE ON FUNCTION candidatos_de_grabacion(uuid), certificar_emision(uuid, uuid, uuid, uuid, timestamptz, integer, numeric, text, bytea) TO app_worker;
GRANT SELECT ON certificados TO app_api;
GRANT UPDATE (anuncio_id) ON pedidos TO app_api;
