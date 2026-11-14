begin;
select plan(15);

-- Schema (S1): decision audit on orders and one alert copy per (order, admin chat)
select has_column('public', 'orders', 'decided_by', 'orders.decided_by exists');
select col_type_is('public', 'orders', 'decided_by', 'bigint', 'decided_by is bigint');
select has_column('public', 'orders', 'decided_by_name', 'orders.decided_by_name exists');
select has_table('public', 'order_admin_messages', 'order_admin_messages exists');
select col_is_pk('public', 'order_admin_messages', array['order_id', 'chat_id'], 'pk is (order_id, chat_id)');
select col_not_null('public', 'order_admin_messages', 'message_id', 'message_id is required');
select col_not_null('public', 'order_admin_messages', 'has_media', 'has_media is required');
select ok((select relrowsecurity from pg_class where oid = 'public.order_admin_messages'::regclass), 'RLS enabled on order_admin_messages');

-- Grants: service_role only
select ok(not has_table_privilege('anon', 'public.order_admin_messages', 'select'), 'anon cannot select order_admin_messages');
select ok(not has_table_privilege('authenticated', 'public.order_admin_messages', 'select'), 'authenticated cannot select order_admin_messages');
select ok(not has_table_privilege('authenticated', 'public.order_admin_messages', 'insert'), 'authenticated cannot insert order_admin_messages');
select ok(has_table_privilege('service_role', 'public.order_admin_messages', 'insert'), 'service_role can insert order_admin_messages');

-- Cascade: deleting an order removes its alert copies
insert into lots (id, slug, name, price_cop, stock, max_per_order, hold_minutes, active)
values ('00000000-0000-0000-0000-0000000000b1', 'ab-lot', 'Admin bot lot', 38000, 5, 5, 120, true);
insert into orders (id, ref, lot_id, qty, unit_price_cop, total_cop, customer_name, customer_phone, customer_address, order_token_hash, ip_hash, consent_at)
values ('00000000-0000-0000-0000-0000000000c1', 'CD-ABADMN', '00000000-0000-0000-0000-0000000000b1', 1, 38000, 38000, 'Ana', '3001234567', 'Calle 1', 'h', 'i', now());
insert into order_admin_messages (order_id, chat_id, message_id, has_media)
values ('00000000-0000-0000-0000-0000000000c1', 111, 7, true);
select throws_ok(
  $$insert into order_admin_messages (order_id, chat_id, message_id, has_media) values ('00000000-0000-0000-0000-0000000000c1', 111, 8, false)$$,
  '23505', null, 'one row per (order, chat)');
select throws_ok(
  $$update orders set decided_by_name = repeat('x', 33) where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '23514', null, 'decided_by_name is limited to 32 chars');
delete from orders where id = '00000000-0000-0000-0000-0000000000c1';
select is((select count(*) from order_admin_messages), 0::bigint, 'alert copies cascade with the order');

select * from finish();
rollback;
