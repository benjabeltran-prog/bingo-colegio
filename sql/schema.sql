-- ============================================================
-- HOGAR FINANZAS - Esquema Supabase (Postgres)
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Extensión para uuid
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- HOGARES (multi-tenant / SaaS)
-- ------------------------------------------------------------
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member', -- 'owner' | 'member'
  display_name text,
  created_at timestamptz default now(),
  unique(household_id, user_id)
);

-- ------------------------------------------------------------
-- MESES (uno por hogar / año / mes)
-- ------------------------------------------------------------
create table if not exists months (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  status text not null default 'open', -- 'open' | 'closed'
  created_at timestamptz default now(),
  unique(household_id, year, month)
);

-- ------------------------------------------------------------
-- INGRESOS
-- ------------------------------------------------------------
create table if not exists incomes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  month_id uuid not null references months(id) on delete cascade,
  person_name text not null,
  description text,
  amount numeric not null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- GASTOS FIJOS (servicios, colegio, actividades, otro)
-- ------------------------------------------------------------
create table if not exists fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  month_id uuid not null references months(id) on delete cascade,
  category text not null default 'otro', -- 'servicios' | 'colegio' | 'actividades' | 'otro'
  name text not null,
  amount numeric not null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- GASTOS EXTRA
-- ------------------------------------------------------------
create table if not exists extra_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  month_id uuid not null references months(id) on delete cascade,
  name text not null,
  amount numeric not null,
  expense_date date,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- TARJETA DE CRÉDITO - cartolas y transacciones desglosadas
-- ------------------------------------------------------------
create table if not exists credit_card_statements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  month_id uuid not null references months(id) on delete cascade,
  file_path text,
  bank text default 'Santander',
  total_billed numeric,
  uploaded_at timestamptz default now()
);

create table if not exists credit_card_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  statement_id uuid not null references credit_card_statements(id) on delete cascade,
  transaction_date date,
  description text,
  installment_info text, -- ej: "1/12"
  amount numeric not null,
  category text default 'Sin categoría',
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- STORAGE bucket para los PDFs de cartola
-- (esto también se puede crear desde el Dashboard > Storage)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cartolas', 'cartolas', false)
on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table households enable row level security;
alter table household_members enable row level security;
alter table months enable row level security;
alter table incomes enable row level security;
alter table fixed_expenses enable row level security;
alter table extra_expenses enable row level security;
alter table credit_card_statements enable row level security;
alter table credit_card_transactions enable row level security;

-- Función helper: ¿el usuario actual pertenece al hogar X?
create or replace function is_member_of(hh uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = hh and user_id = auth.uid()
  );
$$;

-- HOUSEHOLDS: cualquier usuario autenticado puede crear; solo miembros ven/editan
create policy "households_select" on households for select
  using (is_member_of(id));
create policy "households_insert" on households for insert
  with check (auth.uid() = created_by);
create policy "households_update" on households for update
  using (is_member_of(id));

-- HOUSEHOLD_MEMBERS: miembros del hogar se ven entre sí; el propio usuario puede unirse
create policy "members_select" on household_members for select
  using (is_member_of(household_id));
create policy "members_insert_self" on household_members for insert
  with check (user_id = auth.uid());
create policy "members_delete_self_or_owner" on household_members for delete
  using (user_id = auth.uid() or is_member_of(household_id));

-- Resto de tablas: select/insert/update/delete si el usuario pertenece al hogar
create policy "months_all" on months for all
  using (is_member_of(household_id)) with check (is_member_of(household_id));
create policy "incomes_all" on incomes for all
  using (is_member_of(household_id)) with check (is_member_of(household_id));
create policy "fixed_expenses_all" on fixed_expenses for all
  using (is_member_of(household_id)) with check (is_member_of(household_id));
create policy "extra_expenses_all" on extra_expenses for all
  using (is_member_of(household_id)) with check (is_member_of(household_id));
create policy "cc_statements_all" on credit_card_statements for all
  using (is_member_of(household_id)) with check (is_member_of(household_id));
create policy "cc_transactions_all" on credit_card_transactions for all
  using (is_member_of(household_id)) with check (is_member_of(household_id));

-- STORAGE policies (bucket "cartolas"): solo miembros del hogar dueño del archivo
-- Se asume convención de path: {household_id}/{filename}
create policy "cartolas_select" on storage.objects for select
  using (bucket_id = 'cartolas' and is_member_of((storage.foldername(name))[1]::uuid));
create policy "cartolas_insert" on storage.objects for insert
  with check (bucket_id = 'cartolas' and is_member_of((storage.foldername(name))[1]::uuid));

-- ============================================================
-- VISTA: resumen consolidado por mes (para dashboard y reportes)
-- ============================================================
create or replace view v_month_summary as
select
  m.id as month_id,
  m.household_id,
  m.year,
  m.month,
  m.status,
  coalesce((select sum(i.amount) from incomes i where i.month_id = m.id), 0) as total_ingresos,
  coalesce((select sum(f.amount) from fixed_expenses f where f.month_id = m.id), 0) as total_gastos_fijos,
  coalesce((select sum(e.amount) from extra_expenses e where e.month_id = m.id), 0) as total_gastos_extra,
  coalesce((select sum(s.total_billed) from credit_card_statements s where s.month_id = m.id), 0) as total_tarjeta,
  (
    coalesce((select sum(i.amount) from incomes i where i.month_id = m.id), 0)
    -
    (
      coalesce((select sum(f.amount) from fixed_expenses f where f.month_id = m.id), 0)
      + coalesce((select sum(e.amount) from extra_expenses e where e.month_id = m.id), 0)
      + coalesce((select sum(s.total_billed) from credit_card_statements s where s.month_id = m.id), 0)
    )
  ) as ahorro
from months m;
