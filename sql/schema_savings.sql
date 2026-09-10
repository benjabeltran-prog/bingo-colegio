-- ============================================================
-- CUENTAS DE AHORRO / PATRIMONIO
-- Ejecutar en Supabase SQL Editor (una sola vez).
-- Cuenta corriente, depósitos a plazo, cuentas digitales con
-- interés (MercadoPago, MACH, etc.) — saldo mes a mes.
-- ============================================================

create table if not exists savings_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  account_type text not null default 'otro', -- 'cuenta_corriente' | 'deposito_plazo' | 'cuenta_digital' | 'otro'
  interest_rate numeric, -- tasa anual %, opcional
  created_at timestamptz default now()
);

create table if not exists account_balances (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references savings_accounts(id) on delete cascade,
  month_id uuid not null references months(id) on delete cascade,
  balance numeric not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(account_id, month_id)
);

alter table savings_accounts enable row level security;
alter table account_balances enable row level security;

create policy "savings_accounts_all" on savings_accounts for all
  using (is_member_of(household_id)) with check (is_member_of(household_id));
create policy "account_balances_all" on account_balances for all
  using (is_member_of(household_id)) with check (is_member_of(household_id));

-- Vista: patrimonio total consolidado por mes
create or replace view v_month_patrimonio as
select
  m.id as month_id,
  m.household_id,
  m.year,
  m.month,
  coalesce((select sum(ab.balance) from account_balances ab where ab.month_id = m.id), 0) as total_patrimonio
from months m;
