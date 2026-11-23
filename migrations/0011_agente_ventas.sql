-- 0011 · Agente vendedor (PT-5b): conversaciones con Toño, sus mensajes y el gasto diario del modelo.
-- Las conversaciones empiezan antes de que el visitante tenga cuenta, así que no cuelgan de la RLS por anunciante:
-- el navegador guarda un token y la base solo su hash; la API exige ese token (o una sesión del equipo de ventas).
-- P9  · Cada turno suma su costo a la conversación y al día; la API corta al llegar a los topes de config/agente.yaml.
-- P12 · Toda acción del agente queda ligada a su conversación: cada cotización guarda de qué conversación salió.

CREATE TYPE estado_conversacion AS ENUM ('agente', 'traspasada', 'cerrada');

CREATE TABLE conversaciones (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash             bytea NOT NULL UNIQUE,
  anunciante_id          uuid REFERENCES anunciantes(id),
  usuario_id             uuid REFERENCES usuarios(id),
  estado                 estado_conversacion NOT NULL DEFAULT 'agente',
  prospecto              jsonb NOT NULL DEFAULT '{}'::jsonb,
  cotizaciones           uuid[] NOT NULL DEFAULT '{}',
  traspaso_motivo        text CHECK (traspaso_motivo IS NULL OR length(traspaso_motivo) <= 300),
  traspaso_resumen       text CHECK (traspaso_resumen IS NULL OR length(traspaso_resumen) <= 1500),
  traspasada_at          timestamptz,
  turnos                 integer NOT NULL DEFAULT 0,
  tokens_entrada         bigint NOT NULL DEFAULT 0,
  tokens_salida          bigint NOT NULL DEFAULT 0,
  tokens_cache_lectura   bigint NOT NULL DEFAULT 0,
  tokens_cache_escritura bigint NOT NULL DEFAULT 0,
  costo_micro_usd        bigint NOT NULL DEFAULT 0,
  version_instrucciones  text NOT NULL CHECK (length(version_instrucciones) BETWEEN 1 AND 40),
  ip                     inet,
  creado_at              timestamptz NOT NULL DEFAULT now(),
  actualizado_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversaciones_recientes_idx ON conversaciones (actualizado_at DESC);
CREATE INDEX conversaciones_traspasadas_idx ON conversaciones (traspasada_at DESC) WHERE estado = 'traspasada';

-- Los mensajes, tal como se enviaron a la API y se recibieron (con sus bloques de pensamiento): se reenvían sin
-- cambios en cada turno, por eso no se editan ni se borran.
CREATE TABLE conversacion_mensajes (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversacion_id  uuid NOT NULL REFERENCES conversaciones(id),
  orden            integer NOT NULL CHECK (orden >= 0),
  rol              text NOT NULL CHECK (rol IN ('user', 'assistant', 'system')),
  contenido        jsonb NOT NULL,
  creado_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversacion_id, orden)
);
CREATE TRIGGER conversacion_mensajes_sin_cambios BEFORE UPDATE OR DELETE ON conversacion_mensajes FOR EACH ROW EXECUTE FUNCTION solo_anadir();

CREATE TABLE agente_gasto_diario (
  dia              date PRIMARY KEY,
  costo_micro_usd  bigint NOT NULL DEFAULT 0 CHECK (costo_micro_usd >= 0)
);

-- Qué conversación originó cada cotización (P12).
ALTER TABLE cotizaciones ADD COLUMN conversacion_id uuid REFERENCES conversaciones(id);

-- ── permisos ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON conversaciones TO app_api;
GRANT UPDATE (anunciante_id, usuario_id, estado, prospecto, cotizaciones, traspaso_motivo, traspaso_resumen, traspasada_at, turnos,
  tokens_entrada, tokens_salida, tokens_cache_lectura, tokens_cache_escritura, costo_micro_usd, version_instrucciones, actualizado_at)
  ON conversaciones TO app_api;
GRANT SELECT, INSERT ON conversacion_mensajes TO app_api;
GRANT SELECT, INSERT, UPDATE ON agente_gasto_diario TO app_api;
