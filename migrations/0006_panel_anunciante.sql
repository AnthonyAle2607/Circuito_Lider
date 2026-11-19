-- 0006 · Panel del anunciante (2026-11-19).
-- Datos de la empresa que el cliente completa y corrige desde su panel, cambio de nombre y cambio de clave. Todo sigue
-- bajo la RLS de 0001: cada anunciante solo ve y toca su propia fila.

ALTER TABLE anunciantes
  ADD COLUMN id_fiscal   text CHECK (length(id_fiscal) BETWEEN 1 AND 60),
  ADD COLUMN sector      text CHECK (length(sector) BETWEEN 1 AND 100),
  ADD COLUMN sitio_web   text CHECK (length(sitio_web) BETWEEN 1 AND 200),
  ADD COLUMN telefono    text CHECK (length(telefono) BETWEEN 1 AND 40),
  ADD COLUMN direccion   text CHECK (length(direccion) BETWEEN 1 AND 300),
  ADD COLUMN actualizado_at timestamptz;

-- La API sigue sin poder escribir `password_hash` directamente (prueba de RLS de PT-1). El cambio de clave pasa por esta
-- función: solo acepta un hash Argon2id y solo para un usuario de la cuenta fijada con withTenant.
CREATE FUNCTION cambiar_clave_usuario(p_usuario uuid, p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_anunciante_id() IS NULL THEN
    RAISE EXCEPTION 'cambiar_clave_usuario necesita la cuenta fijada (withTenant)';
  END IF;
  IF p_hash IS NULL OR p_hash NOT LIKE '$argon2id$%' THEN
    RAISE EXCEPTION 'la clave debe llegar como hash Argon2id';
  END IF;
  UPDATE usuarios SET password_hash = p_hash WHERE id = p_usuario AND anunciante_id = app_anunciante_id();
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION cambiar_clave_usuario(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION cambiar_clave_usuario(uuid, text) TO app_api;
GRANT UPDATE (empresa, pais, zona_horaria, id_fiscal, sector, sitio_web, telefono, direccion, actualizado_at) ON anunciantes TO app_api;
GRANT UPDATE (nombre) ON usuarios TO app_api;
