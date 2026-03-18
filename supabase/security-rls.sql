-- ============================================================
-- NidoApp — Security: RLS Policies + Indexes
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ─── HABILITAR RLS EN TODAS LAS TABLAS ─────────────────────

ALTER TABLE salas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE miembros             ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pisos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_pisos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_link_codes  ENABLE ROW LEVEL SECURITY;

-- ─── SALAS ─────────────────────────────────────────────────

-- Solo pueden ver salas en las que son miembros
CREATE POLICY "salas: ver propias" ON salas
  FOR SELECT USING (
    id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- Solo el creador puede actualizar/eliminar su sala
CREATE POLICY "salas: editar propias" ON salas
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "salas: eliminar propias" ON salas
  FOR DELETE USING (created_by = auth.uid());

-- Cualquier usuario autenticado puede crear una sala
CREATE POLICY "salas: crear" ON salas
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ─── MIEMBROS ───────────────────────────────────────────────

-- Ver miembros de salas a las que pertenezco
CREATE POLICY "miembros: ver de mi sala" ON miembros
  FOR SELECT USING (
    sala_id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- Solo puedo insertar mi propio miembro (o el admin lo hace via service role)
CREATE POLICY "miembros: insertar propio" ON miembros
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Solo puedo actualizar mi propio perfil de miembro
CREATE POLICY "miembros: actualizar propio" ON miembros
  FOR UPDATE USING (user_id = auth.uid());

-- Solo el dueño de la sala puede eliminar miembros
CREATE POLICY "miembros: eliminar (dueño sala)" ON miembros
  FOR DELETE USING (
    sala_id IN (
      SELECT id FROM salas WHERE created_by = auth.uid()
    )
  );

-- ─── GASTOS ────────────────────────────────────────────────

-- Ver gastos de salas a las que pertenezco
CREATE POLICY "gastos: ver de mi sala" ON gastos
  FOR SELECT USING (
    sala_id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- Insertar gastos en mis salas
CREATE POLICY "gastos: insertar en mi sala" ON gastos
  FOR INSERT WITH CHECK (
    sala_id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- Actualizar solo gastos propios
CREATE POLICY "gastos: actualizar propios" ON gastos
  FOR UPDATE USING (
    pagado_por IN (
      SELECT id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- Eliminar solo gastos propios
CREATE POLICY "gastos: eliminar propios" ON gastos
  FOR DELETE USING (
    pagado_por IN (
      SELECT id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- ─── COMPRAS ────────────────────────────────────────────────

-- Ver lista de compras de mis salas
CREATE POLICY "compras: ver de mi sala" ON compras
  FOR SELECT USING (
    sala_id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- Insertar ítems en mis salas
CREATE POLICY "compras: insertar en mi sala" ON compras
  FOR INSERT WITH CHECK (
    sala_id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- Actualizar ítems de mis salas (cualquier miembro puede marcar como comprado)
CREATE POLICY "compras: actualizar en mi sala" ON compras
  FOR UPDATE USING (
    sala_id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- Eliminar ítems de mis salas
CREATE POLICY "compras: eliminar en mi sala" ON compras
  FOR DELETE USING (
    sala_id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- ─── PISOS ──────────────────────────────────────────────────

-- Ver pisos de mis salas
CREATE POLICY "pisos: ver de mi sala" ON pisos
  FOR SELECT USING (
    sala_id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- Insertar pisos en mis salas
CREATE POLICY "pisos: insertar en mi sala" ON pisos
  FOR INSERT WITH CHECK (
    sala_id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- Actualizar pisos de mis salas
CREATE POLICY "pisos: actualizar en mi sala" ON pisos
  FOR UPDATE USING (
    sala_id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- Eliminar pisos de mis salas
CREATE POLICY "pisos: eliminar en mi sala" ON pisos
  FOR DELETE USING (
    sala_id IN (
      SELECT sala_id FROM miembros WHERE user_id = auth.uid()
    )
  );

-- ─── FOTOS PISOS ────────────────────────────────────────────

-- Ver fotos de pisos de mis salas
CREATE POLICY "fotos_pisos: ver de mi sala" ON fotos_pisos
  FOR SELECT USING (
    piso_id IN (
      SELECT p.id FROM pisos p
      JOIN miembros m ON m.sala_id = p.sala_id
      WHERE m.user_id = auth.uid()
    )
  );

-- Insertar fotos en mis salas
CREATE POLICY "fotos_pisos: insertar en mi sala" ON fotos_pisos
  FOR INSERT WITH CHECK (
    piso_id IN (
      SELECT p.id FROM pisos p
      JOIN miembros m ON m.sala_id = p.sala_id
      WHERE m.user_id = auth.uid()
    )
  );

-- Eliminar fotos en mis salas
CREATE POLICY "fotos_pisos: eliminar en mi sala" ON fotos_pisos
  FOR DELETE USING (
    piso_id IN (
      SELECT p.id FROM pisos p
      JOIN miembros m ON m.sala_id = p.sala_id
      WHERE m.user_id = auth.uid()
    )
  );

-- ─── WHATSAPP LINK CODES ────────────────────────────────────
-- Esta tabla la maneja solo el service role (API routes),
-- los usuarios no deben acceder directamente via cliente.

-- No se permite ningún acceso directo desde el cliente
CREATE POLICY "whatsapp_link_codes: sin acceso cliente" ON whatsapp_link_codes
  FOR ALL USING (false);

-- ─── INDEXES DE RENDIMIENTO ─────────────────────────────────

-- Búsquedas frecuentes por sala_id
CREATE INDEX IF NOT EXISTS idx_miembros_sala_id       ON miembros(sala_id);
CREATE INDEX IF NOT EXISTS idx_miembros_user_id       ON miembros(user_id);
CREATE INDEX IF NOT EXISTS idx_miembros_telefono      ON miembros(telefono) WHERE telefono IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_sala_id         ON gastos(sala_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha           ON gastos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_compras_sala_id        ON compras(sala_id);
CREATE INDEX IF NOT EXISTS idx_compras_comprado       ON compras(comprado);
CREATE INDEX IF NOT EXISTS idx_pisos_sala_id          ON pisos(sala_id);
CREATE INDEX IF NOT EXISTS idx_fotos_pisos_piso_id    ON fotos_pisos(piso_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_codes_code    ON whatsapp_link_codes(code);
CREATE INDEX IF NOT EXISTS idx_whatsapp_codes_miembro ON whatsapp_link_codes(miembro_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_codes_expires ON whatsapp_link_codes(expires_at);

-- Index compuesto para la búsqueda de teléfono + sala (webhook)
CREATE INDEX IF NOT EXISTS idx_miembros_tel_sala
  ON miembros(telefono, sala_id) WHERE telefono IS NOT NULL;

-- ─── LIMPIEZA AUTOMÁTICA DE CÓDIGOS EXPIRADOS ───────────────
-- Opcional: función que se puede llamar con pg_cron o manualmente
CREATE OR REPLACE FUNCTION cleanup_expired_link_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM whatsapp_link_codes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── STORAGE: POLÍTICAS PARA BUCKETS ───────────────────────
-- Ajustar según los nombres de buckets reales en tu proyecto

-- Bucket "pisos" (fotos de pisos)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('pisos', 'pisos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pisos storage: ver (miembros sala)" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'pisos' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "pisos storage: subir (miembros sala)" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'pisos' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "pisos storage: eliminar (miembros sala)" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'pisos' AND
    auth.uid() IS NOT NULL
  );
