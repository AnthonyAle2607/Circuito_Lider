-- 0014 · Órdenes de pauta (RF-20, RF-21). Un pedido pagado con su spot aprobado genera una orden por emisora donde
-- suena (cadena: todas las del circuito; local: la suya). El operador de programación la ve en el panel, carga el
-- spot en el sistema de la emisora y confirma. Si el cliente cambia de anuncio, las órdenes anteriores se anulan y se
-- generan otras. El cliente ve «Programado» cuando todas están cargadas (RF-22).

CREATE TYPE estado_orden AS ENUM ('pendiente', 'cargada', 'anulada');

CREATE TABLE ordenes_pauta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anunciante_id  uuid NOT NULL REFERENCES anunciantes(id),
  pedido_id      uuid NOT NULL REFERENCES pedidos(id),
  emisora_id     uuid NOT NULL REFERENCES emisoras(id),
  anuncio_id     uuid NOT NULL REFERENCES anuncios(id),
  estado         estado_orden NOT NULL DEFAULT 'pendiente',
  nota           text CHECK (nota IS NULL OR length(nota) <= 500),
  creada_at      timestamptz NOT NULL DEFAULT now(),
  cargada_at     timestamptz,
  cargada_por    uuid REFERENCES equipo(id),
  anulada_at     timestamptz
);
-- Una orden viva por pedido, emisora y anuncio.
CREATE UNIQUE INDEX ordenes_vivas_idx ON ordenes_pauta (pedido_id, emisora_id, anuncio_id) WHERE estado <> 'anulada';
CREATE INDEX ordenes_pendientes_idx ON ordenes_pauta (creada_at) WHERE estado = 'pendiente';

ALTER TABLE ordenes_pauta ENABLE ROW LEVEL SECURITY;
CREATE POLICY propio ON ordenes_pauta USING (anunciante_id = app_anunciante_id());

-- ── generar (trabajo programar, cada minuto) ────────────────────────────────
CREATE FUNCTION generar_ordenes() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p record; e record; n integer := 0; v_orden uuid;
BEGIN
  FOR p IN
    SELECT pe.id, pe.anunciante_id, pe.anuncio_id FROM pedidos pe JOIN anuncios a ON a.id = pe.anuncio_id
     WHERE pe.estado = 'pagado' AND a.estado = 'aprobado'
       AND NOT EXISTS (SELECT 1 FROM ordenes_pauta o WHERE o.pedido_id = pe.id AND o.anuncio_id = pe.anuncio_id AND o.estado <> 'anulada')
     FOR UPDATE OF pe SKIP LOCKED
  LOOP
    UPDATE ordenes_pauta SET estado = 'anulada', anulada_at = now(), nota = 'Reemplazada: el cliente cambió el anuncio'
     WHERE pedido_id = p.id AND estado <> 'anulada';
    FOR e IN
      SELECT DISTINCT em.id FROM reservas r
        JOIN franjas f ON f.id = r.franja_id JOIN programas pr ON pr.id = f.programa_id
        JOIN emisoras em ON (pr.alcance = 'nacional' AND em.circuito_id = pr.circuito_id) OR em.id = pr.emisora_id
       WHERE r.pedido_id = p.id AND r.estado = 'confirmada'
    LOOP
      INSERT INTO ordenes_pauta (anunciante_id, pedido_id, emisora_id, anuncio_id) VALUES (p.anunciante_id, p.id, e.id, p.anuncio_id) RETURNING id INTO v_orden;
      INSERT INTO outbox (anunciante_id, tipo, datos) VALUES (p.anunciante_id, 'orden.creada', jsonb_build_object('orden_id', v_orden, 'pedido_id', p.id, 'emisora_id', e.id));
      n := n + 1;
    END LOOP;
    INSERT INTO bitacora (anunciante_id, actor_tipo, actor_nombre, accion, entidad, entidad_id, datos)
      VALUES (p.anunciante_id, 'sistema', 'programar', 'pedido.ordenes_generadas', 'pedido', p.id::text, jsonb_build_object('anuncio_id', p.anuncio_id));
  END LOOP;
  RETURN n;
END $$;

-- ── panel de programación ───────────────────────────────────────────────────
CREATE FUNCTION ordenes_para_operador(p_estado estado_orden) RETURNS TABLE (
  id uuid, estado estado_orden, emisora text, ciudad text, frecuencia text, empresa text, anuncio text, formato text,
  duracion_ms integer, pedido_id uuid, creada_at timestamptz, cargada_at timestamptz, nota text, lineas jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.id, o.estado, em.nombre, em.ciudad, em.frecuencia, a.empresa, an.nombre, an.formato, an.duracion_ms, o.pedido_id,
         o.creada_at, o.cargada_at, o.nota,
         coalesce((SELECT jsonb_agg(jsonb_build_object('fecha', r.fecha, 'inicio', to_char(f.hora_inicio, 'HH24:MI'), 'fin', to_char(f.hora_fin, 'HH24:MI'),
                                                       'programa', pr.nombre, 'segundos', r.segundos) ORDER BY r.fecha, f.hora_inicio)
                     FROM reservas r JOIN franjas f ON f.id = r.franja_id JOIN programas pr ON pr.id = f.programa_id
                    WHERE r.pedido_id = o.pedido_id AND r.estado = 'confirmada' AND (pr.alcance = 'nacional' OR pr.emisora_id = o.emisora_id)), '[]'::jsonb)
    FROM ordenes_pauta o JOIN emisoras em ON em.id = o.emisora_id JOIN anunciantes a ON a.id = o.anunciante_id JOIN anuncios an ON an.id = o.anuncio_id
   WHERE o.estado = p_estado
   ORDER BY o.creada_at
   LIMIT 300
$$;

CREATE FUNCTION spot_de_orden(p_orden uuid) RETURNS TABLE (archivo_clave text, formato text, archivo_nombre text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT an.archivo_clave, an.formato, an.archivo_nombre FROM ordenes_pauta o JOIN anuncios an ON an.id = o.anuncio_id
   WHERE o.id = p_orden AND o.estado <> 'anulada'
$$;

-- Devuelve: cargada | ya_cargada | anulada | no_existe.
CREATE FUNCTION confirmar_orden(p_orden uuid, p_equipo uuid, p_nota text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM ordenes_pauta WHERE id = p_orden FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no_existe'; END IF;
  IF o.estado = 'cargada' THEN RETURN 'ya_cargada'; END IF;
  IF o.estado = 'anulada' THEN RETURN 'anulada'; END IF;
  UPDATE ordenes_pauta SET estado = 'cargada', cargada_at = now(), cargada_por = p_equipo, nota = coalesce(p_nota, nota) WHERE id = p_orden;
  INSERT INTO bitacora (anunciante_id, actor_tipo, actor_id, accion, entidad, entidad_id, datos)
    VALUES (o.anunciante_id, 'equipo', p_equipo, 'orden.cargada', 'orden_pauta', p_orden::text, jsonb_build_object('pedido_id', o.pedido_id, 'emisora_id', o.emisora_id));
  INSERT INTO outbox (anunciante_id, tipo, datos) VALUES (o.anunciante_id, 'orden.cargada', jsonb_build_object('orden_id', p_orden, 'pedido_id', o.pedido_id));
  RETURN 'cargada';
END $$;

REVOKE ALL ON FUNCTION generar_ordenes(), ordenes_para_operador(estado_orden), spot_de_orden(uuid), confirmar_orden(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generar_ordenes() TO app_worker;
GRANT EXECUTE ON FUNCTION ordenes_para_operador(estado_orden), spot_de_orden(uuid), confirmar_orden(uuid, uuid, text) TO app_api;
GRANT SELECT ON ordenes_pauta TO app_api;
