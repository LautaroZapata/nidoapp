-- ============================================
-- Migración: Sistema de billing y planes
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Agregar campos de plan y billing a salas
ALTER TABLE salas ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'free'
  CHECK (plan_type IN ('free', 'pro'));
ALTER TABLE salas ADD COLUMN IF NOT EXISTS owner_user_id text;
ALTER TABLE salas ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE salas ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE salas ADD COLUMN IF NOT EXISTS subscription_status text;
ALTER TABLE salas ADD COLUMN IF NOT EXISTS subscription_end timestamptz;

-- Índices para búsquedas de billing
CREATE INDEX IF NOT EXISTS idx_salas_owner_user_id ON salas(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_salas_stripe_customer ON salas(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_salas_stripe_subscription ON salas(stripe_subscription_id);
