begin;
select plan(28);

-- Fixture: stock 20, 5 units held by a pending_verification order (never expires).
insert into lots (id, slug, name, price_cop, stock, max_per_order, hold_minutes, active, code)
values ('00000000-0000-0000-0000-0000000000b1', 'sa-lot', 'Stock lot', 38000, 20, 6, 120, true, 'sa1'),
       ('00000000-0000-0000-0000-0000000000b2', 'sa-off', 'Paused lot', 38000, 3, 6, 120, false, 'sa2');
insert into orders (ref, lot_id, qty, unit_price_cop, total_cop, customer_name, customer_phone, customer_address,
                    order_token_hash, ip_hash, consent_at, status)
values ('CD-SAAAAA', '00000000-0000-0000-0000-0000000000b1', 5, 38000, 190000, 'Ana Perez', '3001234567',
        'Calle 1 #2-3, Cali', 'h-sa', 'ip-sa', now(), 'pending_verification');

-- Schema and security
select has_table('public', 'stock_adjustments', 'stock_adjustments exists');
select col_is_unique('public', 'stock_adjustments', 'update_id', 'update_id is unique');
select ok((select relrowsecurity from pg_class where oid = 'public.stock_adjustments'::regclass), 'RLS enabled');
select ok(not has_table_privilege('anon', 'public.stock_adjustments', 'select')
      and not has_table_privilege('authenticated', 'public.stock_adjustments', 'select'), 'anon/authenticated have no table access');
select throws_ok($$insert into stock_adjustments (lot_id, kind, delta, reason, admin_id, update_id, stock_before, stock_after)
  values ('00000000-0000-0000-0000-0000000000b1', 'add', 0, 'x', 1, 900, 20, 20)$$, '23514', null, 'delta 0 rejected by check');
select throws_ok($$insert into stock_adjustments (lot_id, kind, delta, reason, admin_id, update_id, stock_before, stock_after)
  values ('00000000-0000-0000-0000-0000000000b1', 'add', 10001, 'x', 1, 901, 20, 20)$$, '23514', null, 'abs(delta) > 10000 rejected by check');
select throws_ok($$insert into stock_adjustments (lot_id, kind, delta, reason, admin_id, update_id, stock_before, stock_after)
  values ('00000000-0000-0000-0000-0000000000b1', 'add', 1, repeat('x', 201), 1, 902, 20, 21)$$, '23514', null, 'reason > 200 rejected by check');
select ok(not has_function_privilege('anon', 'public.adjust_stock(text,int,text,text,bigint,bigint)', 'execute')
      and not has_function_privilege('authenticated', 'public.adjust_stock(text,int,text,text,bigint,bigint)', 'execute'), 'anon/authenticated cannot execute adjust_stock');
select ok(has_function_privilege('service_role', 'public.adjust_stock(text,int,text,text,bigint,bigint)', 'execute'), 'service_role can execute adjust_stock');
select ok((select prosecdef from pg_proc where proname = 'adjust_stock'), 'adjust_stock is security definer');
select matches((select prosrc from pg_proc where proname = 'adjust_stock'), 'for update', 'adjust_stock takes the lot lock');

-- Happy path: add
select is(adjust_stock('sa1', 4, 'add', 'restock', 111, 1001), '{"stock":24,"available":19,"replayed":false}'::jsonb, 'add applies and reports stock/available');
-- Correct: S2.1 stock 24 held 5, -15 applied
select is(adjust_stock('sa1', -15, 'correct', null, 111, 1002), '{"stock":9,"available":4,"replayed":false}'::jsonb, 'correct -15 applies down to near held');
select results_eq($$select kind, delta, stock_before, stock_after, admin_id from stock_adjustments where update_id = 1002$$,
  $$values ('correct'::text, -15, 24, 9, 111::bigint)$$, 'audit row records before/after');

-- BELOW_HELD: available 4, -5 would dip below held
select throws_ok($$select adjust_stock('sa1', -5, 'correct', null, 111, 1003)$$, 'P0001', 'BELOW_HELD', 'below held rejected');
create function pg_temp.below_held_detail() returns text language plpgsql as $f$
declare d text;
begin
  perform adjust_stock('sa1', -5, 'correct', null, 111, 1003);
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $f$;
select is(pg_temp.below_held_detail(), '4', 'BELOW_HELD carries available in detail');
select is((select stock from lots where code = 'sa1'), 9, 'stock unchanged after rejection');
select is((select count(*)::int from stock_adjustments where update_id = 1003), 0, 'no audit row for rejection');
select is(adjust_stock('sa1', -4, 'correct', null, 111, 1004), '{"stock":5,"available":0,"replayed":false}'::jsonb, 'down to exactly held is allowed');

-- Replay: same update_id returns the first result, stock applied once
select is(adjust_stock('sa1', 4, 'add', 'restock', 111, 1001), '{"stock":24,"available":19,"replayed":true}'::jsonb, 'replay returns first result with replayed=true');
select is((select stock from lots where code = 'sa1'), 5, 'replay does not change stock');
select is((select count(*)::int from stock_adjustments where update_id = 1001), 1, 'replay keeps one audit row');

-- Validation
select throws_ok($$select adjust_stock('sa1', -3, 'add', null, 111, 1005)$$, 'P0001', 'INVALID_ARGS', 'add requires delta > 0');
select throws_ok($$select adjust_stock('sa1', 0, 'correct', null, 111, 1006)$$, 'P0001', 'INVALID_ARGS', 'delta 0 rejected');
select throws_ok($$select adjust_stock('sa1', 10001, 'add', null, 111, 1007)$$, 'P0001', 'INVALID_ARGS', 'delta above bound rejected');
select throws_ok($$select adjust_stock('sa1', 1, 'add', repeat('x', 201), 111, 1008)$$, 'P0001', 'INVALID_ARGS', 'long reason rejected');
select throws_ok($$select adjust_stock('nope', 1, 'add', null, 111, 1009)$$, 'P0001', 'LOT_NOT_FOUND', 'unknown code rejected');

-- Paused lot can still be adjusted
select is((adjust_stock('sa2', 2, 'add', null, 111, 1010) ->> 'stock')::int, 5, 'paused lot is adjustable');

select * from finish();
rollback;
