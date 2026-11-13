# Supabase (reservations backend)

Local stack: `pnpm exec supabase start`, `pnpm exec supabase db reset`, tests with
`pnpm exec supabase test db` (pgTAP in `supabase/tests`).

## Private business data (manual step)

The Nequi number and account holder are private configuration. They are NOT
committed, NOT in `VITE_*` env, NOT returned by `get-lot`. The seed ships only
placeholders. Set the real values directly in the target database (SQL editor
or `psql`), never in a migration or seed:

```sql
update lots
set nequi_number = '<real number>',
    nequi_holder = '<account holder>',
    nequi_qr_url = null -- optional
where slug = 'miel-colibri-500g';
```

Go-live checklist (business inputs): real Nequi number and holder (or QR), real
`stock`, and `price_cop`. Adjust stock with
`update lots set stock = <n> where slug = '...'`.

## Access model

RLS is enabled on `lots` and `orders` with no policies, and `anon` and
`authenticated` have no grants: only `service_role` (Edge Functions) can read or
write. `reserve_order` and `available_units` are executable by `service_role` only.
The `receipts` bucket is private (5 MB, jpeg/png/webp/pdf).
