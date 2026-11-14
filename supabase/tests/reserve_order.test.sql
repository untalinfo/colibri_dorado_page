begin;
select plan(34);

-- Fixtures: a lot with stock 10, max 6 per order, 120 min hold.
insert into lots (id, slug, name, price_cop, stock, max_per_order, hold_minutes, active)
values ('00000000-0000-0000-0000-0000000000a1', 't-lot', 'Test lot', 38000, 8, 6, 120, true),
       ('00000000-0000-0000-0000-0000000000a2', 't-lot-one', 'One left', 38000, 1, 6, 120, true),
       ('00000000-0000-0000-0000-0000000000a3', 't-lot-off', 'Inactive', 38000, 5, 6, 120, false);

-- Helper for calls: reserve(slug, qty, ref, ip)
create function pg_temp.reserve(p_slug text, p_qty int, p_ref text, p_ip text default 'ip-default', p_limit int default 100)
returns orders language sql as $$
  select reserve_order(
    p_slug, p_qty,
    '{"name":"Ana Perez","phone":"3001234567","address":"Calle 1 #2-3, Cali","email":null}'::jsonb,
    p_ref, 'hash-' || p_ref, p_ip, p_limit);
$$;

-- Schema and security (S23)
select has_table('public', 'lots', 'lots table exists');
select has_table('public', 'orders', 'orders table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.lots'::regclass), 'RLS enabled on lots');
select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'RLS enabled on orders');
select hasnt_column('public', 'lots', 'city', 'lots has no city column');
select col_not_null('public', 'orders', 'customer_address', 'address is required');
select col_not_null('public', 'orders', 'consent_at', 'consent is required');
select col_is_null('public', 'orders', 'customer_email', 'email is optional');
select ok(not has_function_privilege('anon', 'public.reserve_order(text,int,jsonb,text,text,text,int)', 'execute'), 'anon cannot execute reserve_order');
select ok(has_function_privilege('service_role', 'public.reserve_order(text,int,jsonb,text,text,text,int)', 'execute'), 'service_role can execute reserve_order');
select ok(not has_function_privilege('authenticated', 'public.available_units(uuid)', 'execute'), 'authenticated cannot execute available_units');

set local role anon;
select throws_ok('select * from public.orders', '42501', null, 'anon cannot read orders');
select throws_ok('select * from public.lots', '42501', null, 'anon cannot read lots');
reset role;

-- Happy path (S7)
select is((pg_temp.reserve('t-lot', 3, 'CD-AAAAAA')).status, 'pending_payment', 'new order is pending_payment');
select is((select total_cop from orders where ref = 'CD-AAAAAA'), 114000, 'total is snapshot qty x price');
select is(available_units('00000000-0000-0000-0000-0000000000a1'), 5, 'available = stock - active holds (S1)');

-- Quantity range (S10)
select throws_ok($$select pg_temp.reserve('t-lot', 0, 'CD-BBBBB1')$$, 'INVALID_QTY', 'qty 0 rejected');
select throws_ok($$select pg_temp.reserve('t-lot', 7, 'CD-BBBBB2')$$, 'INVALID_QTY', 'qty above max rejected');
select throws_ok($$select pg_temp.reserve('t-lot-off', 1, 'CD-BBBBB3')$$, 'LOT_UNAVAILABLE', 'inactive lot rejected');

-- Insufficient stock (S8)
select throws_ok($$select pg_temp.reserve('t-lot', 6, 'CD-CCCCC1')$$, 'OUT_OF_STOCK', 'qty above available rejected');
select is(available_units('00000000-0000-0000-0000-0000000000a1'), 5, 'failed order holds nothing');

-- Oversell: serialized by the row lock (S9)
select is((pg_temp.reserve('t-lot-one', 1, 'CD-DDDDD1')).status, 'pending_payment', 'first order takes the last unit');
select throws_ok($$select pg_temp.reserve('t-lot-one', 1, 'CD-DDDDD2')$$, 'OUT_OF_STOCK', 'second order is refused');
select matches((select prosrc from pg_proc where proname = 'reserve_order'), 'for update', 'reserve_order locks the lot row');

-- Rate limit (S13)
select pg_temp.reserve('t-lot', 1, 'CD-EEEEE1', 'ip-rl', 2);
select pg_temp.reserve('t-lot', 1, 'CD-EEEEE2', 'ip-rl', 2);
select throws_ok($$select pg_temp.reserve('t-lot', 1, 'CD-EEEEE3', 'ip-rl', 2)$$, 'RATE_LIMITED', 'third order from same ip refused');
select is((select count(*)::int from orders where ref = 'CD-EEEEE3'), 0, 'rate limited call stores no order');
select throws_ok($$select pg_temp.reserve('t-lot', 1, 'CD-EEEEE4', 'ip-rl-null', null)$$, 'INVALID_RATE_LIMIT', 'missing rate limit fails closed');

-- Lazy expiry (S2, S3): hold is 120 minutes
update orders set created_at = now() - interval '121 minutes' where ref = 'CD-AAAAAA';
select is(available_units('00000000-0000-0000-0000-0000000000a1'), 8 - 2, 'stale pending_payment no longer holds');
select is((pg_temp.reserve('t-lot', 1, 'CD-FFFFF1', 'ip-exp')).status, 'pending_payment', 'reserve proceeds after expiry');
select is((select status from orders where ref = 'CD-AAAAAA'), 'expired', 'reserve_order marks stale hold as expired');

insert into orders (ref, lot_id, qty, unit_price_cop, total_cop, customer_name, customer_phone, customer_address, status, order_token_hash, ip_hash, consent_at, created_at)
values ('CD-GGGGG1', '00000000-0000-0000-0000-0000000000a1', 4, 38000, 152000, 'Luis', '3101112233', 'Cra 5', 'pending_verification', 'h', 'ip-x', now(), now() - interval '500 minutes');
select is(available_units('00000000-0000-0000-0000-0000000000a1'), 8 - 2 - 1 - 4, 'pending_verification still holds after hold window');

-- Bucket (S17, S18, S23)
select is((select public from storage.buckets where id = 'receipts'), false, 'receipts bucket is private');
select is((select file_size_limit from storage.buckets where id = 'receipts'), 5242880::bigint, 'receipts limited to 5MB');
select is((select allowed_mime_types from storage.buckets where id = 'receipts'), array['image/jpeg','image/png','image/webp','application/pdf'], 'receipts mime allowlist');

select * from finish();
rollback;
