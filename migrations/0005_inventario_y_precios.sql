-- 0005 · Inventario y precios (PT-3): tarifario versionado, cotizaciones, pedidos, cupos y reservas.
--
-- P2 · El inventario no se sobrevende: `cupos` lleva los segundos usados por franja y fecha. Reservar suma con un UPDATE
--      condicionado (usados + s <= tanda de la franja) que bloquea la fila: dos reservas sobre el último segundo no
--      pueden ganar las dos.
-- P3 · Una reserva siempre vence: el pedido guarda `reserva_vence_at` y `liberar_reservas_vencidas()` devuelve el cupo.
-- P4 · El precio de una cotización no cambia: la cotización guarda tarifario, moneda e importes, y un tarifario
--      publicado no se edita (se publica una versión nueva).
-- Dinero en enteros de la unidad mínima (centavos), decisión D15.

CREATE TYPE estado_cotizacion AS ENUM ('vigente', 'en_aprobacion', 'rechazada', 'reservada');
CREATE TYPE estado_pedido     AS ENUM ('reservado', 'pagado', 'cancelado', 'vencido');
CREATE TYPE estado_reserva    AS ENUM ('retenida', 'confirmada', 'liberada');

-- ── tarifario versionado ────────────────────────────────────────────────────
CREATE TABLE tarifarios (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version                     integer NOT NULL UNIQUE CHECK (version > 0),
  moneda                      char(3) NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
  vigente_desde               timestamptz NOT NULL,
  vigencia_cotizacion_horas   integer NOT NULL CHECK (vigencia_cotizacion_horas BETWEEN 1 AND 720),
  reserva_horas               integer NOT NULL CHECK (reserva_horas BETWEEN 1 AND 168),
  umbral_aprobacion_centimos  bigint NOT NULL CHECK (umbral_aprobacion_centimos >= 0),
  es_ejemplo                  boolean NOT NULL DEFAULT false,
  notas                       text CHECK (notas IS NULL OR length(notas) <= 2000),
  creado_por                  uuid REFERENCES equipo(id),
  creado_at                   timestamptz NOT NULL DEFAULT now()
);

-- Precio por emisión según alcance (en cadena o local) y duración del spot.
CREATE TABLE tarifas (
  tarifario_id       uuid NOT NULL REFERENCES tarifarios(id),
  alcance            alcance_programa NOT NULL,
  duracion_segundos  smallint NOT NULL CHECK (duracion_segundos BETWEEN 10 AND 120),
  precio_centimos    bigint NOT NULL CHECK (precio_centimos > 0),
  PRIMARY KEY (tarifario_id, alcance, duracion_segundos)
);

-- Descuento por volumen: desde N emisiones en una misma cotización, en puntos básicos (500 = 5 %).
CREATE TABLE descuentos_volumen (
  tarifario_id   uuid NOT NULL REFERENCES tarifarios(id),
  min_emisiones  integer NOT NULL CHECK (min_emisiones >= 2),
  descuento_bps  integer NOT NULL CHECK (descuento_bps BETWEEN 1 AND 9000),
  PRIMARY KEY (tarifario_id, min_emisiones)
);

CREATE TRIGGER tarifarios_sin_cambios BEFORE UPDATE OR DELETE ON tarifarios FOR EACH ROW EXECUTE FUNCTION solo_anadir();
CREATE TRIGGER tarifas_sin_cambios BEFORE UPDATE OR DELETE ON tarifas FOR EACH ROW EXECUTE FUNCTION solo_anadir();
CREATE TRIGGER descuentos_sin_cambios BEFORE UPDATE OR DELETE ON descuentos_volumen FOR EACH ROW EXECUTE FUNCTION solo_anadir();

-- ── cotizaciones ────────────────────────────────────────────────────────────
-- No llevan datos personales: cualquiera cotiza sin cuenta y la consulta por su id (uuid aleatorio). Sin RLS.
CREATE TABLE cotizaciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifario_id         uuid NOT NULL REFERENCES tarifarios(id),
  moneda               char(3) NOT NULL,
  duracion_segundos    smallint NOT NULL,
  emisiones            integer NOT NULL CHECK (emisiones BETWEEN 1 AND 500),
  subtotal_centimos    bigint NOT NULL CHECK (subtotal_centimos > 0),
  descuento_centimos   bigint NOT NULL CHECK (descuento_centimos >= 0),
  total_centimos       bigint NOT NULL,
  estado               estado_cotizacion NOT NULL DEFAULT 'vigente',
  requiere_aprobacion  boolean NOT NULL DEFAULT false,
  vence_at             timestamptz NOT NULL,
  decidido_por         uuid REFERENCES equipo(id),
  decidido_at          timestamptz,
  motivo_decision      text CHECK (motivo_decision IS NULL OR length(motivo_decision) <= 1000),
  ip                   inet,
  creado_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (total_centimos = subtotal_centimos - descuento_centimos AND total_centimos > 0)
);
CREATE INDEX cotizaciones_aprobacion_idx ON cotizaciones (creado_at) WHERE estado = 'en_aprobacion';

-- Cada línea es una emisión: una franja en una fecha concreta, con el precio que se le fijó.
CREATE TABLE cotizacion_lineas (
  cotizacion_id    uuid NOT NULL REFERENCES cotizaciones(id),
  franja_id        uuid NOT NULL REFERENCES franjas(id),
  fecha            date NOT NULL,
  precio_centimos  bigint NOT NULL CHECK (precio_centimos > 0),
  PRIMARY KEY (cotizacion_id, franja_id, fecha)
);

-- ── pedidos ─────────────────────────────────────────────────────────────────
CREATE TABLE pedidos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anunciante_id          uuid NOT NULL REFERENCES anunciantes(id),
  cotizacion_id          uuid NOT NULL UNIQUE REFERENCES cotizaciones(id),   -- una cotización se reserva una sola vez
  usuario_id             uuid NOT NULL REFERENCES usuarios(id),
  estado                 estado_pedido NOT NULL DEFAULT 'reservado',
  moneda                 char(3) NOT NULL,
  total_centimos         bigint NOT NULL CHECK (total_centimos > 0),
  reserva_vence_at       timestamptz NOT NULL,
  terminos_version       text NOT NULL CHECK (length(terminos_version) BETWEEN 1 AND 60),
  terminos_aceptados_at  timestamptz NOT NULL,
  creado_at              timestamptz NOT NULL DEFAULT now(),
  actualizado_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pedidos_anunciante_idx ON pedidos (anunciante_id, creado_at DESC);
CREATE INDEX pedidos_por_vencer_idx ON pedidos (reserva_vence_at) WHERE estado = 'reservado';

-- ── inventario ──────────────────────────────────────────────────────────────
-- Segundos ya tomados por franja y fecha. La capacidad es `franjas.segundos_tanda` en el momento de reservar.
CREATE TABLE cupos (
  franja_id        uuid NOT NULL REFERENCES franjas(id),
  fecha            date NOT NULL,
  segundos_usados  integer NOT NULL DEFAULT 0 CHECK (segundos_usados >= 0),
  PRIMARY KEY (franja_id, fecha)
);

CREATE TABLE reservas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anunciante_id  uuid NOT NULL REFERENCES anunciantes(id),
  pedido_id      uuid NOT NULL REFERENCES pedidos(id),
  franja_id      uuid NOT NULL REFERENCES franjas(id),
  fecha          date NOT NULL,
  segundos       smallint NOT NULL CHECK (segundos > 0),
  estado         estado_reserva NOT NULL DEFAULT 'retenida',
  creado_at      timestamptz NOT NULL DEFAULT now(),
  liberada_at    timestamptz,
  UNIQUE (pedido_id, franja_id, fecha)
);

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY propio ON pedidos USING (anunciante_id = app_anunciante_id()) WITH CHECK (anunciante_id = app_anunciante_id());
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
CREATE POLICY propio ON reservas USING (anunciante_id = app_anunciante_id()) WITH CHECK (anunciante_id = app_anunciante_id());

-- ── vencimiento de reservas (P3) ────────────────────────────────────────────
-- La corre el trabajo `liberar-reservas` cada minuto con el rol app_worker. Atraviesa anunciantes, por eso es
-- SECURITY DEFINER y hace solo esto: vencer el pedido, liberar sus reservas, devolver el cupo y dejar constancia.
CREATE FUNCTION liberar_reservas_vencidas() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p record;
  n integer := 0;
BEGIN
  FOR p IN
    SELECT id, anunciante_id FROM pedidos
     WHERE estado = 'reservado' AND reserva_vence_at < now()
     ORDER BY reserva_vence_at
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE cupos c SET segundos_usados = c.segundos_usados - r.segundos
      FROM reservas r
     WHERE r.pedido_id = p.id AND r.estado = 'retenida' AND c.franja_id = r.franja_id AND c.fecha = r.fecha;
    UPDATE reservas SET estado = 'liberada', liberada_at = now() WHERE pedido_id = p.id AND estado = 'retenida';
    UPDATE pedidos SET estado = 'vencido', actualizado_at = now() WHERE id = p.id;
    INSERT INTO bitacora (anunciante_id, actor_tipo, actor_nombre, accion, entidad, entidad_id)
      VALUES (p.anunciante_id, 'sistema', 'liberar-reservas', 'pedido.vencido', 'pedido', p.id::text);
    INSERT INTO outbox (anunciante_id, tipo, datos)
      VALUES (p.anunciante_id, 'pedido.vencido', jsonb_build_object('pedido_id', p.id));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION liberar_reservas_vencidas() FROM PUBLIC;

-- ── permisos ────────────────────────────────────────────────────────────────
GRANT SELECT ON tarifarios, tarifas, descuentos_volumen TO app_api;
GRANT INSERT ON tarifarios, tarifas, descuentos_volumen TO app_api;          -- nueva versión desde el panel
GRANT SELECT, INSERT ON cotizaciones, cotizacion_lineas TO app_api;
GRANT UPDATE (estado, decidido_por, decidido_at, motivo_decision) ON cotizaciones TO app_api;
GRANT SELECT, INSERT ON pedidos TO app_api;
GRANT UPDATE (estado, actualizado_at) ON pedidos TO app_api;
GRANT SELECT, INSERT ON cupos TO app_api;
GRANT UPDATE (segundos_usados) ON cupos TO app_api;
GRANT SELECT, INSERT ON reservas TO app_api;
GRANT UPDATE (estado, liberada_at) ON reservas TO app_api;
GRANT EXECUTE ON FUNCTION liberar_reservas_vencidas() TO app_worker;
