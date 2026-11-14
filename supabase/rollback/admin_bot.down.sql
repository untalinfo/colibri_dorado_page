-- Rollback for the Telegram admin bot. Run sections in reverse order (S4 -> S1).
-- Redeploy the previous functions first (see README).

-- S1
drop table if exists public.order_admin_messages;
alter table public.orders drop column if exists decided_by_name;
alter table public.orders drop column if exists decided_by;
