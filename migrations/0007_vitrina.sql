-- 0007 · Vitrina de emisoras (2026-11-19).
-- La señal en vivo y la descripción de cada emisora, para escucharla y conocerla en el portal antes de pautar.
-- Las descripciones de programas usan la columna `programas.descripcion` que ya existe desde 0002.

ALTER TABLE emisoras
  ADD COLUMN stream_url  text CHECK (stream_url ~ '^https://[^[:space:]]+$' AND length(stream_url) <= 300),
  ADD COLUMN descripcion text CHECK (length(descripcion) BETWEEN 1 AND 1000);
