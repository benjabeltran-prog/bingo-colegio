-- ============================================================
-- MANEJO DEL HOGAR
-- Lista de compras (con ítems recurrentes) + Planificación
-- (actividades compartidas del hogar).
-- ============================================================

-- ---------------- LISTA DE COMPRAS ----------------
create table if not exists shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  is_recurring boolean not null default false,
  is_purchased boolean not null default false,
  created_at timestamptz default now(),
  purchased_at timestamptz
);

alter table shopping_list_items enable row level security;
create policy "shopping_list_items_all" on shopping_list_items for all
  using (is_member_of(household_id)) with check (is_member_of(household_id));

-- ---------------- PLANIFICACIÓN DEL HOGAR (actividades) ----------------
create table if not exists household_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  created_by uuid references auth.users(id),
  created_by_email text,
  created_at timestamptz default now()
);

alter table household_events enable row level security;
create policy "household_events_all" on household_events for all
  using (is_member_of(household_id)) with check (is_member_of(household_id));
