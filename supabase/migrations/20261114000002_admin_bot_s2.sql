-- Telegram admin bot S2: short lot codes for commands and a read-only overview.
-- Nullable on purpose: production sets the real value after the migration (see README).
alter table public.lots
  add column code text unique check (code ~ '^[a-z0-9]{2,8}$');

-- One round trip for /lotes. Explicit columns: nequi_* never leaves the database through this path.
create function public.lot_overview()
returns table (code text, name text, price_cop int, stock int, available int, active boolean)
language sql
stable
security definer
set search_path = public
as $$
  select l.code, l.name, l.price_cop, l.stock, public.available_units(l.id), l.active
  from lots l
  where l.code is not null
  order by l.code;
$$;

revoke execute on function public.lot_overview() from public, anon, authenticated;
grant execute on function public.lot_overview() to service_role;
