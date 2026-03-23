-- Campos de personalización expandida para miembros
alter table miembros add column if not exists gradiente text;
alter table miembros add column if not exists icono text;
