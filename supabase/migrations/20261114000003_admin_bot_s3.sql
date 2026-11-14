-- Telegram admin bot S3: audited stock adjustments, idempotent per Telegram update.
create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id),
  kind text not null check (kind in ('add', 'correct')),
  delta int not null check (delta <> 0 and abs(delta) <= 10000),
  reason text check (length(reason) <= 200),
  admin_id bigint not null,
  update_id bigint not null unique,
  stock_before int not null,
  stock_after int not null,
  available_after int,
  created_at timestamptz not null default now()
);
alter table public.stock_adjustments enable row level security;
revoke all on public.stock_adjustments from anon, authenticated;

-- Lock the lot first (same FOR UPDATE as reserve_order), then check the replay,
-- so retries of one update serialize on the lot and never raise a unique violation.
create function public.adjust_stock(
  p_code text, p_delta int, p_kind text, p_reason text, p_admin_id bigint, p_update_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l lots;
  prev stock_adjustments;
  avail int;
begin
  if p_kind not in ('add', 'correct')
     or p_delta is null or p_delta = 0 or abs(p_delta) > 10000
     or (p_kind = 'add' and p_delta < 0)
     or length(p_reason) > 200
     or p_admin_id is null or p_update_id is null then
    raise exception 'INVALID_ARGS';
  end if;

  select * into l from lots where code = p_code for update;
  if not found then
    raise exception 'LOT_NOT_FOUND';
  end if;

  select * into prev from stock_adjustments where update_id = p_update_id;
  if found then
    return jsonb_build_object('stock', prev.stock_after, 'available', prev.available_after, 'replayed', true);
  end if;

  update orders set status = 'expired'
  where lot_id = l.id
    and status = 'pending_payment'
    and created_at <= now() - make_interval(mins => l.hold_minutes);

  avail := available_units(l.id);
  if p_delta < -avail then
    raise exception 'BELOW_HELD' using detail = avail::text;
  end if;

  update lots set stock = stock + p_delta where id = l.id;
  avail := avail + p_delta;

  insert into stock_adjustments (lot_id, kind, delta, reason, admin_id, update_id, stock_before, stock_after, available_after)
  values (l.id, p_kind, p_delta, p_reason, p_admin_id, p_update_id, l.stock, l.stock + p_delta, avail);

  return jsonb_build_object('stock', l.stock + p_delta, 'available', avail, 'replayed', false);
end;
$$;

revoke execute on function public.adjust_stock(text, int, text, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.adjust_stock(text, int, text, text, bigint, bigint) to service_role;
