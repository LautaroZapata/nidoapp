-- Habilitar Realtime para miembros (necesario para notificaciones de remoción/unión en tiempo real)
alter publication supabase_realtime add table miembros;
