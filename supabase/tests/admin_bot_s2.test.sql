begin;
select plan(13);

-- lots.code: nullable, unique, shaped like LOT_CODE_RE
select has_column('public', 'lots', 'code', 'lots.code exists');
select col_is_null('public', 'lots', 'code', 'lots.code is nullable (set per lot)');
select col_is_unique('public', 'lots', 'code', 'lots.code is unique');
select is((select code from lots where slug = 'miel-colibri-500g'), 'm500', 'seed lot has code m500');
select throws_ok($$update lots set code = 'M500' where slug = 'miel-colibri-500g'$$, '23514', null, 'uppercase code rejected');
select throws_ok($$update lots set code = 'a' where slug = 'miel-colibri-500g'$$, '23514', null, '1-char code rejected');
select throws_ok($$update lots set code = 'abcdefghi' where slug = 'miel-colibri-500g'$$, '23514', null, '9-char code rejected');

-- lot_overview(): explicit columns, no nequi_*, service_role only
insert into lots (id, slug, name, price_cop, stock, max_per_order, hold_minutes, active, code)
values ('00000000-0000-0000-0000-0000000000d1', 'ov-lot', 'Overview lot', 1000, 5, 5, 120, false, 'ov1');
select throws_ok($$insert into lots (slug, name, price_cop, stock, code) values ('ov-dup', 'Dup', 1000, 1, 'ov1')$$, '23505', null, 'duplicate code rejected');
select results_eq(
  $$select code, name, price_cop, stock, available, active from lot_overview() where code = 'ov1'$$,
  $$values ('ov1'::text, 'Overview lot'::text, 1000, 5, 5, false)$$,
  'lot_overview returns code, name, price, stock, available, active (paused lots included)');
select is(
  (select proargnames from pg_proc where proname = 'lot_overview'),
  array['code', 'name', 'price_cop', 'stock', 'available', 'active'],
  'lot_overview columns are explicit and carry no nequi_*');
select ok((select prosecdef from pg_proc where proname = 'lot_overview'), 'lot_overview is security definer');
select ok(not has_function_privilege('anon', 'public.lot_overview()', 'execute')
      and not has_function_privilege('authenticated', 'public.lot_overview()', 'execute'), 'anon/authenticated cannot execute lot_overview');
select ok(has_function_privilege('service_role', 'public.lot_overview()', 'execute'), 'service_role can execute lot_overview');

select * from finish();
rollback;
