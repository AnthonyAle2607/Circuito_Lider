-- 0010 · Pagos (PT-5): pago por pasarela (alojado) y por transferencia con comprobante.
-- P5 · Un pago se confirma una sola vez: cada aviso de la pasarela se guarda con su id único antes de tocar nada;
--      repetirlo no cambia nada. La conciliación usa el mismo camino con su propio id de evento.
-- P6 · Datos de tarjeta, nunca: solo proveedor, referencia externa, monto, moneda y estado.
-- La API no cambia estados de pagos ni de pedidos: lo hacen resolver_pago() (aviso o conciliación) y
-- decidir_transferencia() (finanzas), que atraviesan anunciantes y por eso son SECURITY DEFINER y hacen solo eso.

CREATE TYPE estado_pago AS ENUM ('pendiente', 'aprobado', 'rechazado', 'expirado');
CREATE TYPE metodo_pago AS ENUM ('pasarela', 'transferencia');

CREATE TABLE pagos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anunciante_id       uuid NOT NULL REFERENCES anunciantes(id),
  pedido_id           uuid NOT NULL REFERENCES pedidos(id),
  usuario_id          uuid NOT NULL REFERENCES usuarios(id),
  metodo              metodo_pago NOT NULL,
  proveedor           text NOT NULL CHECK (proveedor ~ '^[a-z0-9_-]{2,30}$'),   -- pasarela, o 'transferencia'
  referencia_externa  text CHECK (referencia_externa IS NULL OR length(referencia_externa) BETWEEN 1 AND 200),
  monto_centimos      bigint NOT NULL CHECK (monto_centimos > 0),
  moneda              char(3) NOT NULL,
  estado              estado_pago NOT NULL DEFAULT 'pendiente',
  url_pago            text CHECK (url_pago IS NULL OR length(url_pago) <= 2000),
  vence_at            timestamptz,
  -- Transferencia: archivo del comprobante en el almacén y la referencia bancaria que escribe el cliente.
  comprobante_clave   text CHECK (comprobante_clave IS NULL OR length(comprobante_clave) <= 300),
  comprobante_nombre  text CHECK (comprobante_nombre IS NULL OR length(comprobante_nombre) <= 200),
  motivo              text CHECK (motivo IS NULL OR length(motivo) <= 1000),
  revisado_por        uuid REFERENCES equipo(id),
  creado_at           timestamptz NOT NULL DEFAULT now(),
  actualizado_at      timestamptz NOT NULL DEFAULT now(),
  confirmado_at       timestamptz,
  CHECK (metodo = 'pasarela' OR comprobante_clave IS NOT NULL)
);
-- Solo las sesiones de pasarela son únicas: dos bancos distintos pueden dar la misma referencia a dos transferencias.
CREATE UNIQUE INDEX pagos_referencia_idx ON pagos (proveedor, referencia_externa) WHERE referencia_externa IS NOT NULL AND metodo = 'pasarela';
CREATE INDEX pagos_pedido_idx ON pagos (pedido_id, creado_at DESC);
CREATE INDEX pagos_pendientes_idx ON pagos (creado_at) WHERE estado = 'pendiente';
-- Sin índice único de «un aprobado por pedido»: si alguien paga dos veces (dos sesiones abiertas), el segundo cobro
-- tiene que quedar registrado como «tardío» para devolverlo, no perderse en un error.

ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY propio ON pagos USING (anunciante_id = app_anunciante_id()) WITH CHECK (anunciante_id = app_anunciante_id());

-- Avisos crudos de las pasarelas. Sin RLS ni permisos directos: solo los toca resolver_pago().
CREATE TABLE webhook_eventos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proveedor    text NOT NULL,
  evento_id    text NOT NULL CHECK (length(evento_id) BETWEEN 1 AND 200),
  tipo         text NOT NULL CHECK (length(tipo) BETWEEN 1 AND 100),
  cuerpo       jsonb NOT NULL,
  resultado    text,
  recibido_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proveedor, evento_id)
);

-- ── confirmar un pago aprobado (uso interno de las dos funciones de abajo) ───────
-- Si el pedido sigue reservado, pasa a pagado y sus reservas a confirmadas. Si ya venció o se canceló, el pago queda
-- aprobado igual (el dinero llegó) y se avisa a finanzas para devolverlo: 'tardio'.
CREATE FUNCTION confirmar_pago_interno(p_pago uuid, p_actor tipo_actor, p_actor_id uuid, p_actor_nombre text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pg record; pe record;
BEGIN
  SELECT * INTO pg FROM pagos WHERE id = p_pago FOR UPDATE;
  SELECT * INTO pe FROM pedidos WHERE id = pg.pedido_id FOR UPDATE;
  IF pe.estado <> 'reservado' THEN
    UPDATE pagos SET estado = 'aprobado', confirmado_at = now(), actualizado_at = now(), motivo = 'Llegó con el pedido ' || pe.estado::text WHERE id = p_pago;
    INSERT INTO bitacora (anunciante_id, actor_tipo, actor_id, actor_nombre, accion, entidad, entidad_id, datos)
      VALUES (pg.anunciante_id, p_actor, p_actor_id, p_actor_nombre, 'pago.tardio', 'pago', p_pago::text, jsonb_build_object('pedido_id', pe.id, 'estado_pedido', pe.estado));
    INSERT INTO outbox (anunciante_id, tipo, datos) VALUES (pg.anunciante_id, 'pago.tardio', jsonb_build_object('pago_id', p_pago, 'pedido_id', pe.id));
    RETURN 'tardio';
  END IF;
  UPDATE pagos SET estado = 'aprobado', confirmado_at = now(), actualizado_at = now() WHERE id = p_pago;
  UPDATE pedidos SET estado = 'pagado', actualizado_at = now() WHERE id = pe.id;
  UPDATE reservas SET estado = 'confirmada' WHERE pedido_id = pe.id AND estado = 'retenida';
  -- Las demás sesiones abiertas del mismo pedido ya no sirven.
  UPDATE pagos SET estado = 'expirado', actualizado_at = now() WHERE pedido_id = pe.id AND id <> p_pago AND estado = 'pendiente';
  INSERT INTO bitacora (anunciante_id, actor_tipo, actor_id, actor_nombre, accion, entidad, entidad_id, datos)
    VALUES (pg.anunciante_id, p_actor, p_actor_id, p_actor_nombre, 'pedido.pagado', 'pedido', pe.id::text,
            jsonb_build_object('pago_id', p_pago, 'metodo', pg.metodo, 'monto_centimos', pg.monto_centimos, 'moneda', pg.moneda));
  INSERT INTO outbox (anunciante_id, tipo, datos) VALUES (pg.anunciante_id, 'pedido.pagado', jsonb_build_object('pedido_id', pe.id, 'pago_id', p_pago));
  RETURN 'confirmado';
END $$;

-- ── aviso de la pasarela o conciliación ─────────────────────────────────────
-- Devuelve: duplicado | desconocido | monto_distinto | sin_cambio | confirmado | tardio | rechazado | expirado.
CREATE FUNCTION resolver_pago(p_proveedor text, p_evento_id text, p_tipo text, p_referencia text, p_estado estado_pago,
                              p_monto bigint, p_moneda text, p_cuerpo jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_evento bigint; pg record; v_res text;
BEGIN
  INSERT INTO webhook_eventos (proveedor, evento_id, tipo, cuerpo) VALUES (p_proveedor, p_evento_id, p_tipo, p_cuerpo)
    ON CONFLICT (proveedor, evento_id) DO NOTHING RETURNING id INTO v_evento;
  IF v_evento IS NULL THEN RETURN 'duplicado'; END IF;

  SELECT * INTO pg FROM pagos WHERE proveedor = p_proveedor AND referencia_externa = p_referencia FOR UPDATE;
  IF NOT FOUND THEN
    v_res := 'desconocido';
  -- Un cobro aprobado siempre se registra, aunque la sesión ya se hubiera dado por vencida: el dinero llegó.
  -- Lo demás (rechazos, vencimientos) solo cambia un pago que sigue pendiente.
  ELSIF pg.estado = 'aprobado' OR p_estado = 'pendiente' OR (pg.estado <> 'pendiente' AND p_estado <> 'aprobado') THEN
    v_res := 'sin_cambio';
  ELSIF p_estado = 'aprobado' AND (p_monto <> pg.monto_centimos OR upper(p_moneda) <> pg.moneda) THEN
    -- No se confirma un monto distinto al del pedido: lo revisa finanzas.
    v_res := 'monto_distinto';
    INSERT INTO outbox (anunciante_id, tipo, datos)
      VALUES (pg.anunciante_id, 'pago.revisar', jsonb_build_object('pago_id', pg.id, 'monto', p_monto, 'moneda', p_moneda));
  ELSIF p_estado = 'aprobado' THEN
    v_res := confirmar_pago_interno(pg.id, 'sistema', NULL, 'pasarela:' || p_proveedor);
  ELSE
    UPDATE pagos SET estado = p_estado, actualizado_at = now() WHERE id = pg.id;
    v_res := p_estado::text;
  END IF;
  UPDATE webhook_eventos SET resultado = v_res WHERE id = v_evento;
  RETURN v_res;
END $$;

-- ── transferencias: revisión de finanzas ────────────────────────────────────
CREATE FUNCTION transferencias_por_revisar() RETURNS TABLE (
  id uuid, pedido_id uuid, empresa text, monto_centimos bigint, moneda char(3), referencia_externa text,
  comprobante_nombre text, creado_at timestamptz, reserva_vence_at timestamptz, estado_pedido estado_pedido)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.pedido_id, a.empresa, p.monto_centimos, p.moneda, p.referencia_externa, p.comprobante_nombre, p.creado_at,
         pe.reserva_vence_at, pe.estado
    FROM pagos p JOIN pedidos pe ON pe.id = p.pedido_id JOIN anunciantes a ON a.id = p.anunciante_id
   WHERE p.metodo = 'transferencia' AND p.estado = 'pendiente'
   ORDER BY p.creado_at
$$;

CREATE FUNCTION comprobante_de_transferencia(p_pago uuid) RETURNS TABLE (comprobante_clave text, comprobante_nombre text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT comprobante_clave, comprobante_nombre FROM pagos WHERE id = p_pago AND metodo = 'transferencia'
$$;

-- Devuelve: confirmado | tardio | rechazado | ya_decidido.
CREATE FUNCTION decidir_transferencia(p_pago uuid, p_aprobar boolean, p_motivo text, p_equipo uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pg record;
BEGIN
  SELECT * INTO pg FROM pagos WHERE id = p_pago AND metodo = 'transferencia' AND estado = 'pendiente' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'ya_decidido'; END IF;
  UPDATE pagos SET revisado_por = p_equipo, motivo = p_motivo WHERE id = p_pago;
  IF p_aprobar THEN RETURN confirmar_pago_interno(p_pago, 'equipo', p_equipo, NULL); END IF;
  UPDATE pagos SET estado = 'rechazado', actualizado_at = now() WHERE id = p_pago;
  INSERT INTO bitacora (anunciante_id, actor_tipo, actor_id, accion, entidad, entidad_id, datos)
    VALUES (pg.anunciante_id, 'equipo', p_equipo, 'pago.rechazado', 'pago', p_pago::text, jsonb_build_object('motivo', p_motivo));
  INSERT INTO outbox (anunciante_id, tipo, datos) VALUES (pg.anunciante_id, 'pago.rechazado', jsonb_build_object('pago_id', p_pago, 'pedido_id', pg.pedido_id));
  RETURN 'rechazado';
END $$;

-- ── conciliación: sesiones de pasarela que siguen pendientes después de un rato ──
CREATE FUNCTION pagos_por_conciliar(p_mayores_de interval) RETURNS TABLE (proveedor text, referencia_externa text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT proveedor, referencia_externa FROM pagos
   WHERE metodo = 'pasarela' AND estado = 'pendiente' AND referencia_externa IS NOT NULL AND creado_at < now() - p_mayores_de
   ORDER BY creado_at LIMIT 50
$$;

-- ── vencimiento: un pedido con una transferencia por revisar no vence ─────────
-- El cliente pagó a tiempo; mientras finanzas revisa, sus espacios siguen retenidos.
CREATE OR REPLACE FUNCTION liberar_reservas_vencidas() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p record;
  n integer := 0;
BEGIN
  FOR p IN
    SELECT id, anunciante_id FROM pedidos pe
     WHERE estado = 'reservado' AND reserva_vence_at < now()
       AND NOT EXISTS (SELECT 1 FROM pagos x WHERE x.pedido_id = pe.id AND x.metodo = 'transferencia' AND x.estado = 'pendiente')
     ORDER BY reserva_vence_at
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE cupos c SET segundos_usados = c.segundos_usados - r.segundos
      FROM reservas r
     WHERE r.pedido_id = p.id AND r.estado = 'retenida' AND c.franja_id = r.franja_id AND c.fecha = r.fecha;
    UPDATE reservas SET estado = 'liberada', liberada_at = now() WHERE pedido_id = p.id AND estado = 'retenida';
    UPDATE pedidos SET estado = 'vencido', actualizado_at = now() WHERE id = p.id;
    UPDATE pagos SET estado = 'expirado', actualizado_at = now() WHERE pedido_id = p.id AND estado = 'pendiente';
    INSERT INTO bitacora (anunciante_id, actor_tipo, actor_nombre, accion, entidad, entidad_id)
      VALUES (p.anunciante_id, 'sistema', 'liberar-reservas', 'pedido.vencido', 'pedido', p.id::text);
    INSERT INTO outbox (anunciante_id, tipo, datos)
      VALUES (p.anunciante_id, 'pedido.vencido', jsonb_build_object('pedido_id', p.id));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION confirmar_pago_interno(uuid, tipo_actor, uuid, text), resolver_pago(text, text, text, text, estado_pago, bigint, text, jsonb),
  transferencias_por_revisar(), comprobante_de_transferencia(uuid), decidir_transferencia(uuid, boolean, text, uuid),
  pagos_por_conciliar(interval), liberar_reservas_vencidas() FROM PUBLIC;

-- ── permisos ────────────────────────────────────────────────────────────────
-- La API crea el pago y anota la sesión de la pasarela; los estados los cambian solo las funciones.
GRANT SELECT, INSERT ON pagos TO app_api;
GRANT UPDATE (referencia_externa, url_pago, vence_at, actualizado_at) ON pagos TO app_api;
GRANT EXECUTE ON FUNCTION resolver_pago(text, text, text, text, estado_pago, bigint, text, jsonb), transferencias_por_revisar(),
  comprobante_de_transferencia(uuid), decidir_transferencia(uuid, boolean, text, uuid) TO app_api;
GRANT EXECUTE ON FUNCTION resolver_pago(text, text, text, text, estado_pago, bigint, text, jsonb), pagos_por_conciliar(interval),
  liberar_reservas_vencidas() TO app_worker;
