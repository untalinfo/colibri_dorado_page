-- Telegram admin bot S1: multi-admin alert copies and decision audit.
alter table public.orders
  add column decided_by bigint,
  add column decided_by_name text check (length(decided_by_name) <= 32);

-- One alert copy per (order, admin chat): lets a decision edit every admin's message.
create table public.order_admin_messages (
  order_id uuid not null references public.orders (id) on delete cascade,
  chat_id bigint not null,
  message_id bigint not null,
  has_media boolean not null,
  created_at timestamptz not null default now(),
  primary key (order_id, chat_id)
);

alter table public.order_admin_messages enable row level security;
revoke all on public.order_admin_messages from anon, authenticated;
