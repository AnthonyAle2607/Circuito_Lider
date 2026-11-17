-- 0002 · Catálogo de radio: circuitos, emisoras, programas y franjas.
-- Es información pública (no pertenece a ningún anunciante): sin RLS, solo lectura para la aplicación.
-- Las horas de las franjas son hora local de Venezuela (America/Caracas, UTC−4 sin horario de verano; decisión D14).
-- La carga de las nueve emisoras de Circuito Líder y su edición desde el panel llegan en PT-2.

CREATE TYPE alcance_programa AS ENUM ('nacional', 'local');

CREATE TABLE circuitos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE CHECK (length(nombre) BETWEEN 1 AND 120),
  creado_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE emisoras (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circuito_id   uuid NOT NULL REFERENCES circuitos(id),
  nombre        text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 120),
  ciudad        text NOT NULL CHECK (length(ciudad) BETWEEN 1 AND 120),
  frecuencia    text NOT NULL CHECK (frecuencia ~ '^[0-9]{2,3}\.[0-9] FM$'),
  zona_horaria  text NOT NULL DEFAULT 'America/Caracas',
  activa        boolean NOT NULL DEFAULT true,
  creado_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (circuito_id, nombre)
);

-- Un programa nacional suena en cadena en todas las emisoras del circuito; uno local, solo en su emisora.
CREATE TABLE programas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circuito_id  uuid NOT NULL REFERENCES circuitos(id),
  emisora_id   uuid REFERENCES emisoras(id),
  nombre       text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 160),
  alcance      alcance_programa NOT NULL,
  descripcion  text CHECK (descripcion IS NULL OR length(descripcion) <= 2000),
  activo       boolean NOT NULL DEFAULT true,
  creado_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((alcance = 'nacional') = (emisora_id IS NULL))
);
CREATE INDEX programas_emisora_idx ON programas (emisora_id);

-- Una franja es un bloque semanal de un programa con sus segundos de tanda comercial (el cupo que se vende).
CREATE TABLE franjas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id     uuid NOT NULL REFERENCES programas(id),
  dia_semana      smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),   -- ISO: 1 = lunes
  hora_inicio     time NOT NULL,
  hora_fin        time NOT NULL,
  segundos_tanda  integer NOT NULL CHECK (segundos_tanda BETWEEN 0 AND 3600),
  activa          boolean NOT NULL DEFAULT true,
  creado_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_fin > hora_inicio)
);
CREATE INDEX franjas_programa_idx ON franjas (programa_id, dia_semana);

GRANT SELECT ON circuitos, emisoras, programas, franjas TO app_api, app_worker;
