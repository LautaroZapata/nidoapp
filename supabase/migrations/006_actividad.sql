-- ============================================
-- Tabla de actividad persistente por sala
-- ============================================

create table if not exists actividad (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid references salas(id) on delete cascade not null,
  texto text not null,
  icono text not null default '📋',
  url text,
  creado_en timestamptz default now()
);

alter table actividad enable row level security;
create policy "Acceso público actividad" on actividad for all using (true) with check (true);

-- Índice para consultas por sala ordenadas por fecha
create index if not exists idx_actividad_sala_creado on actividad (sala_id, creado_en desc);

-- Habilitar Realtime para que nuevos eventos lleguen en tiempo real
alter publication supabase_realtime add table actividad;
