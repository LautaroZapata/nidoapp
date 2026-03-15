-- ============================================
-- NidoApp - Schema completo
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. SALAS
create table salas (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  creado_en timestamptz default now(),
  constraint salas_codigo_length check (char_length(codigo) between 3 and 30)
);

-- 2. MIEMBROS
create table miembros (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid references salas(id) on delete cascade not null,
  nombre text not null,
  color text not null default '#6366f1',
  creado_en timestamptz default now(),
  unique(sala_id, nombre)
);

-- 3. PISOS
create table pisos (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid references salas(id) on delete cascade not null,
  titulo text not null,
  url text,
  precio numeric,
  m2 numeric,
  zona text,
  notas text,
  fotos text[] default '{}',
  creado_en timestamptz default now()
);

-- 4. VOTOS DE PISO
create table votos_piso (
  id uuid primary key default gen_random_uuid(),
  piso_id uuid references pisos(id) on delete cascade not null,
  miembro_id uuid references miembros(id) on delete cascade not null,
  puntuacion int not null check (puntuacion between 1 and 5),
  comentario text,
  creado_en timestamptz default now(),
  unique(piso_id, miembro_id)
);

-- 5. GASTOS
create table gastos (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid references salas(id) on delete cascade not null,
  descripcion text not null,
  importe numeric not null,
  categoria text not null check (categoria in ('alquiler', 'suministros', 'internet', 'comida', 'limpieza', 'otro')),
  pagado_por uuid references miembros(id) on delete set null,
  tipo text not null check (tipo in ('fijo', 'variable')),
  fecha date default current_date,
  splits jsonb default null,
  creado_en timestamptz default now()
);

-- 6. ITEMS DE COMPRA
create table items_compra (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid references salas(id) on delete cascade not null,
  nombre text not null,
  cantidad int default 1,
  completado boolean default false,
  añadido_por uuid references miembros(id) on delete set null,
  creado_en timestamptz default now()
);

-- 7. TAREAS
create table tareas (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid references salas(id) on delete cascade not null,
  nombre text not null,
  asignada_a uuid references miembros(id) on delete set null,
  semana text not null,
  completada boolean default false,
  creado_en timestamptz default now()
);

-- ============================================
-- Row Level Security (RLS)
-- Permitir acceso público (sin auth, usando anon key)
-- ============================================

alter table salas enable row level security;
alter table miembros enable row level security;
alter table pisos enable row level security;
alter table votos_piso enable row level security;
alter table gastos enable row level security;
alter table items_compra enable row level security;
alter table tareas enable row level security;

-- Políticas permisivas para acceso con anon key
create policy "Acceso público salas" on salas for all using (true) with check (true);
create policy "Acceso público miembros" on miembros for all using (true) with check (true);
create policy "Acceso público pisos" on pisos for all using (true) with check (true);
create policy "Acceso público votos_piso" on votos_piso for all using (true) with check (true);
create policy "Acceso público gastos" on gastos for all using (true) with check (true);
create policy "Acceso público items_compra" on items_compra for all using (true) with check (true);
create policy "Acceso público tareas" on tareas for all using (true) with check (true);

-- ============================================
-- Habilitar Realtime para gastos, items_compra y tareas
-- ============================================

alter publication supabase_realtime add table gastos;
alter publication supabase_realtime add table items_compra;
alter publication supabase_realtime add table tareas;

-- ============================================
-- Migraciones (ejecutar si la tabla ya existe)
-- ============================================

-- Añadir columna splits a gastos (si no existe)
alter table gastos add column if not exists splits jsonb default null;

-- Migrar codigo de char(6) a texto libre (contraseña elegida por el usuario)
-- EJECUTAR SOLO ESTAS LÍNEAS si la tabla salas ya existe:
alter table salas alter column codigo type text;
alter table salas drop constraint if exists salas_codigo_check;
alter table salas add constraint salas_codigo_length check (char_length(codigo) between 3 and 30);

-- Habilitar Realtime para gastos (si no está)
-- (ejecutar solo si no se corrió el alter publication de arriba)
-- alter publication supabase_realtime add table gastos;

-- 8. PAGOS DIRECTOS (liquidaciones de deuda)
create table pagos (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid references salas(id) on delete cascade not null,
  de_id uuid references miembros(id) on delete cascade not null,
  a_id uuid references miembros(id) on delete cascade not null,
  importe numeric not null,
  fecha date default current_date,
  creado_en timestamptz default now()
);

alter table pagos enable row level security;
create policy "Acceso público pagos" on pagos for all using (true) with check (true);

-- ============================================
-- Sistema de contraseñas por miembro
-- EJECUTAR en Supabase SQL Editor
-- ============================================
alter table miembros add column if not exists password_hash text default null;
alter table miembros add column if not exists salt text default null;

-- Añadir columna nota a pagos (concepto del pago)
alter table pagos add column if not exists nota text default null;
