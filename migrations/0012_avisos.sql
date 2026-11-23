-- 0012 · Despacho de avisos (outbox → n8n). Los trabajos toman los eventos pendientes con un «préstamo» de 2 min
-- (dos trabajadores nunca mandan el mismo a la vez), los entregan firmados a n8n y marcan el resultado. Si falla, se
-- reintenta con espera creciente (1, 2, 4… min, hasta 6 h) y a los 10 intentos queda parado para revisarlo a mano.
-- n8n decide qué correo o mensaje sale de cada evento; aquí se adjunta el contacto del anunciante para que no tenga
-- que consultar la base.

ALTER TABLE outbox ADD COLUMN proximo_intento_at timestamptz NOT NULL DEFAULT now();
DROP INDEX outbox_pendientes_idx;
CREATE INDEX outbox_pendientes_idx ON outbox (proximo_intento_at) WHERE despachado_at IS NULL;

CREATE FUNCTION tomar_avisos(p_max integer) RETURNS TABLE (
  id bigint, tipo text, anunciante_id uuid, datos jsonb, creado_at timestamptz, intentos integer, contacto jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH t AS (
    SELECT o.id FROM outbox o
     WHERE o.despachado_at IS NULL AND o.proximo_intento_at <= now() AND o.intentos < 10
     ORDER BY o.id LIMIT least(p_max, 100)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE outbox o SET proximo_intento_at = now() + interval '2 minutes'
    FROM t WHERE o.id = t.id
  RETURNING o.id, o.tipo, o.anunciante_id, o.datos, o.creado_at, o.intentos,
    (SELECT jsonb_build_object('email', u.email::text, 'nombre', u.nombre, 'empresa', a.empresa, 'pais', a.pais)
       FROM usuarios u JOIN anunciantes a ON a.id = u.anunciante_id
      WHERE u.anunciante_id = o.anunciante_id
      ORDER BY u.creado_at LIMIT 1)
$$;

-- p_error NULL = entregado. Con error: suma el intento y programa el siguiente.
CREATE FUNCTION resolver_aviso(p_id bigint, p_error text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE outbox SET
    despachado_at      = CASE WHEN p_error IS NULL THEN now() END,
    intentos           = intentos + CASE WHEN p_error IS NULL THEN 0 ELSE 1 END,
    ultimo_error       = CASE WHEN p_error IS NULL THEN ultimo_error ELSE left(p_error, 2000) END,
    proximo_intento_at = CASE WHEN p_error IS NULL THEN proximo_intento_at
                              ELSE now() + least(power(2, intentos) * interval '1 minute', interval '6 hours') END
   WHERE id = p_id AND despachado_at IS NULL
$$;

REVOKE ALL ON FUNCTION tomar_avisos(integer), resolver_aviso(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tomar_avisos(integer), resolver_aviso(bigint, text) TO app_worker;
