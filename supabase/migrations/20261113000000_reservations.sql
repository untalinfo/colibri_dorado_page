-- Nequi reservations: lots, orders, atomic hold RPC, private receipts bucket.
-- Access model: RLS deny-all. Only service_role (Edge Functions) touches data.

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  price_cop int not null check (price_cop > 0),
  stock int not null check (stock >= 0),
  max_per_order int not null default 6 check (max_per_order > 0),
  hold_minutes int not null default 120 check (hold_minutes > 0),
  -- Private business data, set manually (see supabase/README.md). Never public.
  nequi_number text,
  nequi_holder text,
  nequi_qr_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique check (ref ~ '^CD-[A-Z0-9]{6}$'),
  lot_id uuid not null references public.lots (id),
  qty int not null check (qty > 0),
  unit_price_cop int not null check (unit_price_cop > 0),
  total_cop int not null check (total_cop > 0),
  customer_name text not null check (length(btrim(customer_name)) > 0),
  customer_phone text not null check (customer_phone ~ '^3[0-9]{9}$'),
  customer_address text not null check (length(btrim(customer_address)) > 0),
  customer_email text,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'pending_verification', 'confirmed', 'rejected', 'expired')),
  order_token_hash text not null,
  receipt_path text,
  receipt_mime text,
  ip_hash text not null,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  receipt_submitted_at timestamptz,
  decided_at timestamptz,
  telegram_message_id bigint
);

create index orders_lot_status_created_idx on public.orders (lot_id, status, created_at);
create index orders_ip_created_idx on public.orders (ip_hash, created_at);

alter table public.lots enable row level security;
alter table public.orders enable row level security;
revoke all on public.lots, public.orders from anon, authenticated;

-- Units still available: confirmed and in-review orders always hold stock;
-- pending_payment holds only while inside the hold window (lazy expiry).
create function public.available_units(p_lot_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select l.stock - coalesce(sum(o.qty), 0)::int
  from lots l
  left join orders o
    on o.lot_id = l.id
   and (o.status in ('pending_verification', 'confirmed')
        or (o.status = 'pending_payment'
            and o.created_at > now() - make_interval(mins => l.hold_minutes)))
  where l.id = p_lot_id
  group by l.id;
$$;

-- Atomic hold: the FOR UPDATE lock serializes concurrent reservations per lot.
-- Raises LOT_UNAVAILABLE, INVALID_QTY, RATE_LIMITED, OUT_OF_STOCK.
create function public.reserve_order(
  p_lot_slug text,
  p_qty int,
  p_customer jsonb,
  p_ref text,
  p_token_hash text,
  p_ip_hash text,
  p_rate_limit int
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  l lots;
  o orders;
begin
  select * into l from lots where slug = p_lot_slug and active for update;
  if not found then
    raise exception 'LOT_UNAVAILABLE';
  end if;

  if p_qty is null or p_qty < 1 or p_qty > l.max_per_order then
    raise exception 'INVALID_QTY';
  end if;

  -- Fail closed: a missing limit must never disable throttling.
  if p_rate_limit is null or p_rate_limit < 1 then
    raise exception 'INVALID_RATE_LIMIT';
  end if;

  if (select count(*) from orders
      where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= p_rate_limit then
    raise exception 'RATE_LIMITED';
  end if;

  update orders set status = 'expired'
  where lot_id = l.id
    and status = 'pending_payment'
    and created_at <= now() - make_interval(mins => l.hold_minutes);

  if p_qty > available_units(l.id) then
    raise exception 'OUT_OF_STOCK';
  end if;

  insert into orders (
    ref, lot_id, qty, unit_price_cop, total_cop,
    customer_name, customer_phone, customer_address, customer_email,
    order_token_hash, ip_hash, consent_at
  ) values (
    p_ref, l.id, p_qty, l.price_cop, l.price_cop * p_qty,
    p_customer ->> 'name', p_customer ->> 'phone', p_customer ->> 'address',
    nullif(p_customer ->> 'email', ''),
    p_token_hash, p_ip_hash, now()
  ) returning * into o;

  return o;
end;
$$;

revoke execute on function public.available_units(uuid) from public, anon, authenticated;
revoke execute on function public.reserve_order(text, int, jsonb, text, text, text, int)
  from public, anon, authenticated;
grant execute on function public.available_units(uuid) to service_role;
grant execute on function public.reserve_order(text, int, jsonb, text, text, text, int) to service_role;

-- Private receipts bucket. Objects live at {order_id}/receipt.{ext}; uploads use
-- signed URLs minted by Edge Functions (no storage policies = deny for anon).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
