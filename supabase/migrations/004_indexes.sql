-- ============================================================
-- 004_indexes.sql
-- Índices de performance para columnas frecuentemente consultadas
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- gastos: la tabla más consultada, filtrada siempre por sala_id
CREATE INDEX IF NOT EXISTS idx_gastos_sala_id ON gastos(sala_id);
CREATE INDEX IF NOT EXISTS idx_gastos_pagado_por ON gastos(pagado_por);
CREATE INDEX IF NOT EXISTS idx_gastos_sala_fecha ON gastos(sala_id, fecha DESC);

-- miembros: filtrado por sala_id y user_id constantemente
CREATE INDEX IF NOT EXISTS idx_miembros_sala_id ON miembros(sala_id);
CREATE INDEX IF NOT EXISTS idx_miembros_user_id ON miembros(user_id);

-- items_compra: filtrado por sala_id en cada carga de lista
CREATE INDEX IF NOT EXISTS idx_items_compra_sala_id ON items_compra(sala_id);

-- pagos: filtrado por sala_id para cálculo de balances
CREATE INDEX IF NOT EXISTS idx_pagos_sala_id ON pagos(sala_id);
CREATE INDEX IF NOT EXISTS idx_pagos_de_id ON pagos(de_id);
CREATE INDEX IF NOT EXISTS idx_pagos_a_id ON pagos(a_id);

-- pisos: filtrado por sala_id en módulo de búsqueda de apartamentos
CREATE INDEX IF NOT EXISTS idx_pisos_sala_id ON pisos(sala_id);

-- votos_piso: filtrado por piso_id
CREATE INDEX IF NOT EXISTS idx_votos_piso_piso_id ON votos_piso(piso_id);
CREATE INDEX IF NOT EXISTS idx_votos_piso_miembro_id ON votos_piso(miembro_id);

-- tareas: filtrado por sala_id
CREATE INDEX IF NOT EXISTS idx_tareas_sala_id ON tareas(sala_id);

-- salas: búsqueda por código (ya debe tener unique index pero agregar explícito)
CREATE INDEX IF NOT EXISTS idx_salas_codigo ON salas(codigo);

-- WhatsApp: lookup por whatsapp_phone frecuente
CREATE INDEX IF NOT EXISTS idx_miembros_whatsapp_phone ON miembros(whatsapp_phone) WHERE whatsapp_phone IS NOT NULL;

-- invitaciones: lookup por token
CREATE INDEX IF NOT EXISTS idx_invitaciones_token ON invitaciones(token);
CREATE INDEX IF NOT EXISTS idx_invitaciones_sala_id ON invitaciones(sala_id);

-- whatsapp_link_codes: lookup por code y por miembro
CREATE INDEX IF NOT EXISTS idx_whatsapp_link_codes_code ON whatsapp_link_codes(code);
CREATE INDEX IF NOT EXISTS idx_whatsapp_link_codes_miembro_id ON whatsapp_link_codes(miembro_id);

-- whatsapp_pending_confirmations: lookup por miembro_id
CREATE INDEX IF NOT EXISTS idx_whatsapp_pending_miembro_id ON whatsapp_pending_confirmations(miembro_id);

-- push_subscriptions: lookup por miembro_id y sala_id para envío de notificaciones
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_miembro_id ON push_subscriptions(miembro_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_sala_id ON push_subscriptions(sala_id);
