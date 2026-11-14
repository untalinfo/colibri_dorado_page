-- Rollback for the Telegram admin bot. Run sections in reverse order (S4 -> S1).
-- Redeploy the previous functions first (see README).

-- S3
drop function if exists public.adjust_stock(text, int, text, text, bigint, bigint);
drop table if exists public.stock_adjustments;

-- S2
drop function if exists public.lot_overview();
alter table public.lots drop column if exists code;

-- S1
drop table if exists public.order_admin_messages;
alter table public.orders drop column if exists decided_by_name;
alter table public.orders drop column if exists decided_by;
