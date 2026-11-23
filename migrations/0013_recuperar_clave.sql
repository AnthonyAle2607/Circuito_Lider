-- 0013 · Recuperar la clave del anunciante por correo. Igual que la verificación de correo: el código viaja en el
-- enlace y la base guarda solo su hash; sirve una vez y vence en 1 hora. Pedirlo no revela si el correo existe.
-- Al restablecer, se cierran todas las sesiones del usuario (si alguien entró con la clave vieja, queda fuera).

CREATE TABLE recuperaciones_clave (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES usuarios(id),
  codigo_hash  bytea NOT NULL UNIQUE CHECK (octet_length(codigo_hash) = 32),
  vence_at     timestamptz NOT NULL,
  usado_at     timestamptz,
  ip           inet,
  creado_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recuperaciones_usuario_idx ON recuperaciones_clave (usuario_id, creado_at DESC);

-- Devuelve true si se creó el código (la API responde lo mismo en ambos casos). Máximo 3 por hora y usuario.
CREATE FUNCTION pedir_recuperacion_clave(p_email citext, p_codigo_hash bytea, p_enlace text, p_ip inet) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u record;
BEGIN
  SELECT us.id, us.anunciante_id, us.nombre, us.email INTO u
    FROM usuarios us JOIN anunciantes a ON a.id = us.anunciante_id
   WHERE us.email = p_email AND us.estado = 'activa' AND a.estado = 'activa';
  IF NOT FOUND THEN RETURN false; END IF;
  IF (SELECT count(*) FROM recuperaciones_clave WHERE usuario_id = u.id AND creado_at > now() - interval '1 hour') >= 3 THEN
    RETURN false;
  END IF;
  -- Un código nuevo invalida los anteriores sin usar.
  UPDATE recuperaciones_clave SET vence_at = now() WHERE usuario_id = u.id AND usado_at IS NULL AND vence_at > now();
  INSERT INTO recuperaciones_clave (usuario_id, codigo_hash, vence_at, ip) VALUES (u.id, p_codigo_hash, now() + interval '1 hour', p_ip);
  INSERT INTO bitacora (anunciante_id, actor_tipo, actor_id, accion, entidad, entidad_id, ip)
    VALUES (u.anunciante_id, 'anunciante', u.id, 'clave.recuperacion_pedida', 'usuario', u.id::text, p_ip);
  INSERT INTO outbox (anunciante_id, tipo, datos)
    VALUES (u.anunciante_id, 'cuenta.recuperar_clave', jsonb_build_object('usuario_id', u.id, 'email', u.email::text, 'nombre', u.nombre, 'enlace', p_enlace));
  RETURN true;
END $$;

-- Devuelve el usuario si el código era válido (y lo gasta); null si no.
CREATE FUNCTION restablecer_clave(p_codigo_hash bytea, p_password_hash text, p_ip inet) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_anunciante uuid;
BEGIN
  SELECT * INTO r FROM recuperaciones_clave WHERE codigo_hash = p_codigo_hash AND usado_at IS NULL AND vence_at > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE recuperaciones_clave SET usado_at = now() WHERE id = r.id;
  UPDATE usuarios SET password_hash = p_password_hash WHERE id = r.usuario_id RETURNING anunciante_id INTO v_anunciante;
  UPDATE sesiones SET revocada_at = now() WHERE usuario_id = r.usuario_id AND revocada_at IS NULL;
  -- Quien recibió el enlace en su correo demostró que el correo es suyo.
  UPDATE usuarios SET correo_verificado_at = coalesce(correo_verificado_at, now()) WHERE id = r.usuario_id;
  INSERT INTO bitacora (anunciante_id, actor_tipo, actor_id, accion, entidad, entidad_id, ip)
    VALUES (v_anunciante, 'anunciante', r.usuario_id, 'clave.restablecida', 'usuario', r.usuario_id::text, p_ip);
  INSERT INTO outbox (anunciante_id, tipo, datos)
    VALUES (v_anunciante, 'cuenta.clave_cambiada', jsonb_build_object('usuario_id', r.usuario_id));
  RETURN r.usuario_id;
END $$;

REVOKE ALL ON FUNCTION pedir_recuperacion_clave(citext, bytea, text, inet), restablecer_clave(bytea, text, inet) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pedir_recuperacion_clave(citext, bytea, text, inet), restablecer_clave(bytea, text, inet) TO app_api;
