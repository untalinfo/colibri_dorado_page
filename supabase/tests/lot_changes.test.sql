begin;
select plan(47);

-- Fixture: active lot with one held order at the old price, one paused lot.
insert into lots (id, slug, name, price_cop, stock, max_per_order, hold_minutes, active, code)
values ('00000000-0000-0000-0000-0000000000c1', 'lc-lot', 'Change lot', 38000, 20, 6, 120, true, 'lc1'),
       ('00000000-0000-0000-0000-0000000000c2', 'lc-off', 'Paused lot', 38000, 3, 6, 120, false, 'lc2');
insert into orders (ref, lot_id, qty, unit_price_cop, total_cop, customer_name, customer_phone, customer_address,
                    order_token_hash, ip_hash, consent_at, status)
values ('CD-LCAAAA', '00000000-0000-0000-0000-0000000000c1', 2, 38000, 76000, 'Ana Perez', '3001234567',
        'Calle 1 #2-3, Cali', 'h-lc1', 'ip-lc', now(), 'pending_verification'),
       ('CD-LCBBBB', '00000000-0000-0000-0000-0000000000c1', 3, 38000, 114000, 'Luis Gomez', '3007654321',
        'Calle 4 #5-6, Cali', 'h-lc2', 'ip-lc', now(), 'confirmed'),
       ('CD-LCCCCC', '00000000-0000-0000-0000-0000000000c1', 1, 38000, 38000, 'Eva Ruiz', '3000000000',
        'Calle 7 #8-9, Cali', 'h-lc3', 'ip-lc', now(), 'rejected');

-- Schema and security
select has_table('public', 'lot_changes', 'lot_changes exists');
select col_is_unique('public', 'lot_changes', 'update_id', 'update_id is unique');
select ok((select relrowsecurity from pg_class where oid = 'public.lot_changes'::regclass), 'RLS enabled');
select ok(not has_table_privilege('anon', 'public.lot_changes', 'select')
      and not has_table_privilege('authenticated', 'public.lot_changes', 'select'), 'anon/authenticated have no table access');
select throws_ok($$insert into lot_changes (lot_id, kind, old_value, new_value, admin_id, update_id)
  values ('00000000-0000-0000-0000-0000000000c1', 'color', 1, 2, 1, 900)$$, '23514', null, 'unknown kind rejected');
select throws_ok($$insert into lot_changes (lot_id, kind, old_value, new_value, admin_id, update_id)
  values ('00000000-0000-0000-0000-0000000000c1', 'active', 1, 5, 1, 901)$$, '23514', null, 'active new_value must be 0 or 1');
select ok(not has_function_privilege('anon', 'public.change_lot(text,text,int,bigint,bigint)', 'execute')
      and not has_function_privilege('authenticated', 'public.change_lot(text,text,int,bigint,bigint)', 'execute'), 'anon/authenticated cannot execute change_lot');
select ok(has_function_privilege('service_role', 'public.change_lot(text,text,int,bigint,bigint)', 'execute'), 'service_role can execute change_lot');
select ok((select prosecdef from pg_proc where proname = 'change_lot'), 'change_lot is security definer');
select matches((select prosrc from pg_proc where proname = 'change_lot'), 'for update', 'change_lot takes the lot lock');

-- Price: change keeps existing orders at their snapshotted price
select is(change_lot('lc1', 'price', 40000, 111, 2001), '{"changed":true,"old":38000,"new":40000,"replayed":false}'::jsonb, 'price change reports old/new');
select is((select price_cop from lots where code = 'lc1'), 40000, 'lot price updated');
select is((select array_agg(unit_price_cop order by ref) from orders where lot_id = '00000000-0000-0000-0000-0000000000c1'),
  array[38000, 38000, 38000], 'existing orders keep their unit price');
select results_eq($$select kind, old_value, new_value, admin_id from lot_changes where update_id = 2001$$,
  $$values ('price'::text, 38000, 40000, 111::bigint)$$, 'price audit row recorded');
select is(change_lot('lc1', 'price', 40000, 111, 2002), '{"changed":false,"old":40000,"new":40000,"replayed":false}'::jsonb, 'same price is a no-op');
select is((select count(*)::int from lot_changes where update_id = 2002), 0, 'no audit row for same price');
select is(change_lot('lc1', 'price', 40000, 111, 2001), '{"changed":true,"old":38000,"new":40000,"replayed":true}'::jsonb, 'replay returns first result');
select is((select count(*)::int from lot_changes where update_id = 2001), 1, 'replay keeps one audit row');
select is((select count(*)::int from lot_changes), 1, 'only the real change was audited');

-- Price bounds
select throws_ok($$select change_lot('lc1', 'price', 999, 111, 2003)$$, 'P0001', 'INVALID_ARGS', 'below PRICE_MIN rejected');
select throws_ok($$select change_lot('lc1', 'price', 1000001, 111, 2004)$$, 'P0001', 'INVALID_ARGS', 'above PRICE_MAX rejected');
select is((change_lot('lc1', 'price', 1000, 111, 2005) ->> 'new')::int, 1000, 'PRICE_MIN accepted');
select is((change_lot('lc1', 'price', 1000000, 111, 2006) ->> 'new')::int, 1000000, 'PRICE_MAX accepted');
select throws_ok($$select change_lot('lc1', 'color', 1, 111, 2007)$$, 'P0001', 'INVALID_ARGS', 'unknown kind rejected');
select throws_ok($$select change_lot('lc1', 'active', 2, 111, 2008)$$, 'P0001', 'INVALID_ARGS', 'active value must be 0 or 1');
select throws_ok($$select change_lot('nope', 'price', 5000, 111, 2009)$$, 'P0001', 'LOT_NOT_FOUND', 'unknown code rejected');

-- order_summary: counts per status, revenue only from confirmed, bounded window
insert into orders (ref, lot_id, qty, unit_price_cop, total_cop, customer_name, customer_phone, customer_address,
                    order_token_hash, ip_hash, consent_at, status, created_at)
values ('CD-LCOLDD', '00000000-0000-0000-0000-0000000000c1', 4, 38000, 152000, 'Old Buyer', '3001111111',
        'Calle 9 #1-1, Cali', 'h-lc4', 'ip-lc', now(), 'confirmed', now() - interval '10 days');
select ok(not has_function_privilege('anon', 'public.order_summary(int)', 'execute')
      and not has_function_privilege('authenticated', 'public.order_summary(int)', 'execute'), 'anon/authenticated cannot execute order_summary');
select ok(has_function_privilege('service_role', 'public.order_summary(int)', 'execute'), 'service_role can execute order_summary');
select ok((select prosecdef from pg_proc where proname = 'order_summary'), 'order_summary is security definer');
select is((select proargnames from pg_proc where proname = 'order_summary'),
  array['p_days', 'status', 'orders', 'units', 'revenue_cop'], 'order_summary exposes only aggregate columns');
select is((select count(*)::int from order_summary(7)), 5, 'one row per status, zeros included');
select results_eq($$select orders, units, revenue_cop from order_summary(7) where status = 'confirmed'$$,
  $$values (1, 3, 114000::bigint)$$, 'confirmed counts only the window and sums revenue');
select results_eq($$select orders, units, revenue_cop from order_summary(7) where status = 'rejected'$$,
  $$values (1, 1, 0::bigint)$$, 'non-confirmed statuses carry no revenue');
select results_eq($$select orders, units, revenue_cop from order_summary(7) where status = 'expired'$$,
  $$values (0, 0, 0::bigint)$$, 'empty status reports zeros');
select is((select revenue_cop from order_summary(31) where status = 'confirmed'), 266000::bigint, 'wider window includes older orders');
select throws_ok($$select * from order_summary(0)$$, 'P0001', 'INVALID_ARGS', 'days below 1 rejected');
select throws_ok($$select * from order_summary(32)$$, 'P0001', 'INVALID_ARGS', 'days above 31 rejected');

-- Pause: holds stay, reserve_order refuses, audit row written
select is(change_lot('lc1', 'active', 0, 111, 2010), '{"changed":true,"old":1,"new":0,"replayed":false}'::jsonb, 'pause reports old/new');
select is((select active from lots where code = 'lc1'), false, 'lot is paused');
select is((select count(*)::int from orders where lot_id = '00000000-0000-0000-0000-0000000000c1' and status in ('pending_verification', 'confirmed')), 3, 'existing holds untouched');
select throws_ok($$select reserve_order('lc-lot', 1, '{"name":"Ana Perez","phone":"3001234567","address":"Calle 1 #2-3, Cali","email":null}'::jsonb, 'CD-LCNEW1', 'h-new', 'ip-new', 100)$$,
  'P0001', 'LOT_UNAVAILABLE', 'paused lot blocks reserve_order');
select is(change_lot('lc1', 'active', 0, 111, 2011), '{"changed":false,"old":0,"new":0,"replayed":false}'::jsonb, 'pausing a paused lot is a no-op');
select is((select count(*)::int from lot_changes where update_id = 2011), 0, 'no audit row for no-op pause');

-- Resume
select is(change_lot('lc1', 'active', 1, 111, 2012), '{"changed":true,"old":0,"new":1,"replayed":false}'::jsonb, 'resume reports old/new');
select is((reserve_order('lc-lot', 1, '{"name":"Ana Perez","phone":"3001234567","address":"Calle 1 #2-3, Cali","email":null}'::jsonb, 'CD-LCNEW2', 'h-new2', 'ip-new', 100)).qty, 1, 'resumed lot accepts reservations again');
select is(change_lot('lc1', 'active', 1, 111, 2013) ->> 'changed', 'false', 'resuming an active lot is a no-op');
select is((change_lot('lc2', 'active', 1, 111, 2014) ->> 'changed'), 'true', 'lock finds paused lots');

select * from finish();
rollback;
