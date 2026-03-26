-- 008: Perfil completo de miembros
-- Agrega campos de perfil extendido: foto, bio, rol, cumpleanos, contacto emergencia, metodo pago

ALTER TABLE miembros ADD COLUMN IF NOT EXISTS foto_url text DEFAULT NULL;
ALTER TABLE miembros ADD COLUMN IF NOT EXISTS bio text DEFAULT NULL;
ALTER TABLE miembros ADD COLUMN IF NOT EXISTS rol_casa text DEFAULT NULL;
ALTER TABLE miembros ADD COLUMN IF NOT EXISTS cumpleanos date DEFAULT NULL;
ALTER TABLE miembros ADD COLUMN IF NOT EXISTS contacto_emergencia jsonb DEFAULT NULL;
ALTER TABLE miembros ADD COLUMN IF NOT EXISTS metodo_pago text DEFAULT NULL;
