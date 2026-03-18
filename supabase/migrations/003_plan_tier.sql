-- ============================================
-- Migración: Agregar columna plan_tier a salas
-- Ejecutar en Supabase SQL Editor
-- ============================================

ALTER TABLE salas ADD COLUMN IF NOT EXISTS plan_tier text
  CHECK (plan_tier IN ('starter', 'hogar', 'casa_grande'));

CREATE INDEX IF NOT EXISTS idx_salas_plan_tier ON salas(plan_tier);
