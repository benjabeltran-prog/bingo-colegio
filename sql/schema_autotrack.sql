-- ============================================================
-- CUENTAS VINCULADAS AL FLUJO DE CAJA (auto-cálculo)
-- Permite que una cuenta (ej. Cuenta Corriente) se calcule sola
-- a partir de un saldo inicial + el ahorro (ingresos-gastos) de
-- cada mes, en vez de escribir el saldo a mano cada vez.
-- ============================================================

alter table savings_accounts add column if not exists auto_track boolean not null default false;
alter table savings_accounts add column if not exists initial_balance numeric;
alter table savings_accounts add column if not exists initial_month_id uuid references months(id);
