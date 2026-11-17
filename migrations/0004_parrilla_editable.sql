-- 0004 · Parrilla editable (PT-2): datos para mostrarla y para que el equipo corrija franjas y cupos.
--  - `slug` de emisora para las direcciones del portal (/parrilla?emisora=caracas).
--  - `locutores` del programa, como los publica la emisora.
--  - `cupo_confirmado`: los segundos de tanda cargados son estimados hasta que Circuito Líder los confirme
--    (pregunta abierta 3). Ventas lo ve y, más adelante, el cotizador puede advertirlo.
--  - Claves naturales únicas, para que la carga de la parrilla se pueda repetir sin duplicar nada.

ALTER TABLE emisoras ADD COLUMN slug text CHECK (slug ~ '^[a-z0-9-]{2,40}$');
UPDATE emisoras SET slug = lower(regexp_replace(ciudad, '[^A-Za-z0-9]+', '-', 'g')) WHERE slug IS NULL;
ALTER TABLE emisoras ALTER COLUMN slug SET NOT NULL;
ALTER TABLE emisoras ADD CONSTRAINT emisoras_slug_unico UNIQUE (slug);

ALTER TABLE programas ADD COLUMN locutores text CHECK (locutores IS NULL OR length(locutores) <= 300);
ALTER TABLE programas ADD CONSTRAINT programas_unico UNIQUE NULLS NOT DISTINCT (circuito_id, emisora_id, nombre);

ALTER TABLE franjas ADD COLUMN cupo_confirmado boolean NOT NULL DEFAULT false;
ALTER TABLE franjas ADD COLUMN actualizado_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE franjas ADD CONSTRAINT franjas_unica UNIQUE (programa_id, dia_semana, hora_inicio);

-- El equipo (programación) corrige horario, segundos de tanda y si la franja se vende. Cada cambio va a la bitácora
-- desde la API, con el antes y el después.
GRANT UPDATE (hora_inicio, hora_fin, segundos_tanda, activa, cupo_confirmado, actualizado_at) ON franjas TO app_api;
