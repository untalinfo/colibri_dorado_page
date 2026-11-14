-- Local/dev seed. Business values are PLACEHOLDERS on purpose.
-- Set the real Nequi number and holder manually (see supabase/README.md).
insert into lots (slug, name, price_cop, stock, max_per_order, hold_minutes, nequi_number, nequi_holder, active)
values ('miel-colibri-500g', 'Miel Colibri Dorado 500g', 38000, 10, 6, 120,
        'PLACEHOLDER-SET-MANUALLY', 'PLACEHOLDER-HOLDER', true)
on conflict (slug) do nothing;
