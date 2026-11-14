-- Telegram admin bot S4: audited price/pause changes and the order summary read.
create table public.lot_changes (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id),
  kind text not null check (kind in ('price', 'active')),
  old_value int not null,
  new_value int not null,
  admin_id bigint not null,
  update_id bigint not null unique,
  created_at timestamptz not null default now(),
  check (kind <> 'active' or new_value in (0, 1))
);
alter table public.lot_changes enable row level security;
revoke all on public.lot_changes from anon, authenticated;

-- Same lot lock as reserve_order/adjust_stock; no `active` filter so paused lots are found.
-- No-ops (same price, same active state) report changed=false and write no audit row.
create function public.change_lot(
  p_code text, p_kind text, p_value int, p_admin_id bigint, p_update_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l lots;
  prev lot_changes;
  cur int;
begin
  if p_kind not in ('price', 'active')
     or p_value is null
     or (p_kind = 'price' and p_value not between 1000 and 1000000)
     or (p_kind = 'active' and p_value not in (0, 1))
     or p_admin_id is null or p_update_id is null then
    raise exception 'INVALID_ARGS';
  end if;

  select * into l from lots where code = p_code for update;
  if not found then
    raise exception 'LOT_NOT_FOUND';
  end if;

  select * into prev from lot_changes where update_id = p_update_id;
  if found then
    return jsonb_build_object('changed', true, 'old', prev.old_value, 'new', prev.new_value, 'replayed', true);
  end if;

  cur := case when p_kind = 'price' then l.price_cop else l.active::int end;
  if cur = p_value then
    return jsonb_build_object('changed', false, 'old', cur, 'new', cur, 'replayed', false);
  end if;

  if p_kind = 'price' then
    update lots set price_cop = p_value where id = l.id;
  else
    update lots set active = (p_value = 1) where id = l.id;
  end if;

  insert into lot_changes (lot_id, kind, old_value, new_value, admin_id, update_id)
  values (l.id, p_kind, cur, p_value, p_admin_id, p_update_id);

  return jsonb_build_object('changed', true, 'old', cur, 'new', p_value, 'replayed', false);
end;
$$;

-- One row per status (zeros included); revenue counts confirmed orders only.
create function public.order_summary(p_days int)
returns table (status text, orders int, units int, revenue_cop bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_days is null or p_days not between 1 and 31 then
    raise exception 'INVALID_ARGS';
  end if;
  return query
  select s.st,
         count(o.id)::int,
         coalesce(sum(o.qty), 0)::int,
         coalesce(sum(o.total_cop) filter (where s.st = 'confirmed'), 0)::bigint
  from unnest(array['pending_payment', 'pending_verification', 'confirmed', 'rejected', 'expired']) as s(st)
  left join orders o on o.status = s.st and o.created_at > now() - make_interval(days => p_days)
  group by s.st;
end;
$$;

revoke execute on function public.change_lot(text, text, int, bigint, bigint) from public, anon, authenticated;
grant execute on function public.change_lot(text, text, int, bigint, bigint) to service_role;
revoke execute on function public.order_summary(int) from public, anon, authenticated;
grant execute on function public.order_summary(int) to service_role;
