-- ============================================================
-- NidoApp — Security: RLS Policies + Indexes
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ─── HABILITAR RLS EN TODAS LAS TABLAS ─────────────────────

ALTER TABLE salas                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE miembros                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_compra                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pisos                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE votos_piso                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitaciones                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_link_codes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_pending_confirmations ENABLE ROW LEVEL SECURITY;

-- ─── SALAS ─────────────────────────────────────────────────

CREATE POLICY "salas: ver propias" ON salas
  FOR SELECT USING (
    id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "salas: crear" ON salas
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "salas: editar propias" ON salas
  FOR UPDATE USING (
    id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "salas: eliminar (solo dueño)" ON salas
  FOR DELETE USING (
    id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

-- ─── MIEMBROS ───────────────────────────────────────────────

CREATE POLICY "miembros: ver de mi sala" ON miembros
  FOR SELECT USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "miembros: insertar" ON miembros
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "miembros: actualizar propio" ON miembros
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "miembros: eliminar de mi sala" ON miembros
  FOR DELETE USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

-- ─── GASTOS ────────────────────────────────────────────────

CREATE POLICY "gastos: ver de mi sala" ON gastos
  FOR SELECT USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "gastos: insertar en mi sala" ON gastos
  FOR INSERT WITH CHECK (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "gastos: actualizar en mi sala" ON gastos
  FOR UPDATE USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "gastos: eliminar en mi sala" ON gastos
  FOR DELETE USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

-- ─── ITEMS_COMPRA ───────────────────────────────────────────

CREATE POLICY "items_compra: ver de mi sala" ON items_compra
  FOR SELECT USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "items_compra: insertar en mi sala" ON items_compra
  FOR INSERT WITH CHECK (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "items_compra: actualizar en mi sala" ON items_compra
  FOR UPDATE USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "items_compra: eliminar en mi sala" ON items_compra
  FOR DELETE USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

-- ─── PISOS ──────────────────────────────────────────────────

CREATE POLICY "pisos: ver de mi sala" ON pisos
  FOR SELECT USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "pisos: insertar en mi sala" ON pisos
  FOR INSERT WITH CHECK (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "pisos: actualizar en mi sala" ON pisos
  FOR UPDATE USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "pisos: eliminar en mi sala" ON pisos
  FOR DELETE USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

-- ─── VOTOS_PISO ─────────────────────────────────────────────

CREATE POLICY "votos_piso: ver de mi sala" ON votos_piso
  FOR SELECT USING (
    piso_id IN (
      SELECT p.id FROM pisos p
      JOIN miembros m ON m.sala_id = p.sala_id
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "votos_piso: insertar" ON votos_piso
  FOR INSERT WITH CHECK (
    piso_id IN (
      SELECT p.id FROM pisos p
      JOIN miembros m ON m.sala_id = p.sala_id
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "votos_piso: actualizar propio" ON votos_piso
  FOR UPDATE USING (
    miembro_id IN (SELECT id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "votos_piso: eliminar propio" ON votos_piso
  FOR DELETE USING (
    miembro_id IN (SELECT id FROM miembros WHERE user_id = auth.uid())
  );

-- ─── PAGOS ──────────────────────────────────────────────────

CREATE POLICY "pagos: ver de mi sala" ON pagos
  FOR SELECT USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "pagos: insertar en mi sala" ON pagos
  FOR INSERT WITH CHECK (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "pagos: eliminar en mi sala" ON pagos
  FOR DELETE USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

-- ─── INVITACIONES ───────────────────────────────────────────

CREATE POLICY "invitaciones: ver de mi sala" ON invitaciones
  FOR SELECT USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "invitaciones: crear en mi sala" ON invitaciones
  FOR INSERT WITH CHECK (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

CREATE POLICY "invitaciones: actualizar en mi sala" ON invitaciones
  FOR UPDATE USING (
    sala_id IN (SELECT sala_id FROM miembros WHERE user_id = auth.uid())
  );

-- ─── WHATSAPP (solo service role) ───────────────────────────
-- Estas tablas las maneja únicamente el servidor via service role key.
-- Ningún cliente puede acceder directamente.

CREATE POLICY "whatsapp_link_codes: sin acceso cliente" ON whatsapp_link_codes
  FOR ALL USING (false);

CREATE POLICY "whatsapp_pending_confirmations: sin acceso cliente" ON whatsapp_pending_confirmations
  FOR ALL USING (false);

-- ─── INDEXES DE RENDIMIENTO ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_miembros_sala_id       ON miembros(sala_id);
CREATE INDEX IF NOT EXISTS idx_miembros_user_id       ON miembros(user_id);
CREATE INDEX IF NOT EXISTS idx_miembros_telefono      ON miembros(telefono) WHERE telefono IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_miembros_tel_sala       ON miembros(telefono, sala_id) WHERE telefono IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_sala_id         ON gastos(sala_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha           ON gastos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_items_compra_sala_id   ON items_compra(sala_id);
CREATE INDEX IF NOT EXISTS idx_items_compra_completado ON items_compra(completado);
CREATE INDEX IF NOT EXISTS idx_pisos_sala_id          ON pisos(sala_id);
CREATE INDEX IF NOT EXISTS idx_votos_piso_piso_id     ON votos_piso(piso_id);
CREATE INDEX IF NOT EXISTS idx_votos_piso_miembro_id  ON votos_piso(miembro_id);
CREATE INDEX IF NOT EXISTS idx_pagos_sala_id          ON pagos(sala_id);
CREATE INDEX IF NOT EXISTS idx_invitaciones_sala_id   ON invitaciones(sala_id);
CREATE INDEX IF NOT EXISTS idx_invitaciones_token     ON invitaciones(token);
CREATE INDEX IF NOT EXISTS idx_wl_code                ON whatsapp_link_codes(code);
CREATE INDEX IF NOT EXISTS idx_wl_miembro             ON whatsapp_link_codes(miembro_id);
CREATE INDEX IF NOT EXISTS idx_wl_expires             ON whatsapp_link_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_wpc_miembro            ON whatsapp_pending_confirmations(miembro_id);

-- ─── LIMPIEZA AUTOMÁTICA DE CÓDIGOS EXPIRADOS ───────────────

CREATE OR REPLACE FUNCTION cleanup_expired_whatsapp_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM whatsapp_link_codes WHERE expires_at < NOW();
  DELETE FROM whatsapp_pending_confirmations WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── STORAGE: BUCKET "pisos" ────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
  VALUES ('pisos', 'pisos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pisos storage: ver" ON storage.objects
  FOR SELECT USING (bucket_id = 'pisos' AND auth.uid() IS NOT NULL);

CREATE POLICY "pisos storage: subir" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'pisos' AND auth.uid() IS NOT NULL);

CREATE POLICY "pisos storage: eliminar" ON storage.objects
  FOR DELETE USING (bucket_id = 'pisos' AND auth.uid() IS NOT NULL);
