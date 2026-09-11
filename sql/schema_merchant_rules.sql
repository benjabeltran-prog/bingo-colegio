-- ============================================================
-- REGLAS DE CATEGORÍA APRENDIDAS
-- Cuando editas la categoría de un movimiento de tarjeta, la app
-- recuerda "este comercio = esta categoría" para que la próxima
-- cartola que subas ya venga bien clasificada.
-- ============================================================

create table if not exists merchant_category_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  merchant_pattern text not null,   -- fragmento del texto de la descripción (en minúsculas)
  category text not null,
  created_at timestamptz default now(),
  unique(household_id, merchant_pattern)
);

alter table merchant_category_rules enable row level security;

create policy "merchant_category_rules_all" on merchant_category_rules for all
  using (is_member_of(household_id)) with check (is_member_of(household_id));
