# Supabase (reservations backend)

Local stack: `pnpm exec supabase start`, `pnpm exec supabase db reset`, tests with
`pnpm exec supabase test db` (pgTAP in `supabase/tests`).

## Private business data (manual step)

The Nequi number and account holder are private configuration. They are NOT
committed, NOT in `VITE_*` env, NOT returned by `get-lot`. The seed ships only
placeholders. Set the real values directly in the target database (SQL editor
or `psql`), never in a migration or seed.

`seed.sql` only runs on a local `db reset`; `supabase db push` does NOT seed.
A fresh production database has no lot row, so `get-lot` answers
`LOT_UNAVAILABLE` until you create it. Run this upsert once in production (safe
to re-run; it also updates an existing row):

```sql
insert into lots (slug, name, price_cop, stock, max_per_order, hold_minutes,
                  nequi_number, nequi_holder, nequi_qr_url, active)
values ('miel-colibri-500g', 'Miel Colibri Dorado 500g', <price_cop>, <stock>, 6, 120,
        '<real number>', '<account holder>', null, true)
on conflict (slug) do update
set name = excluded.name,
    price_cop = excluded.price_cop,
    stock = excluded.stock,
    max_per_order = excluded.max_per_order,
    hold_minutes = excluded.hold_minutes,
    nequi_number = excluded.nequi_number,
    nequi_holder = excluded.nequi_holder,
    nequi_qr_url = excluded.nequi_qr_url,
    active = excluded.active;
```

The slug must match `LOT_SLUG` (keep-alive) and the slug the site requests.
Later stock changes: `update lots set stock = <n> where slug = '...'`.

## Access model

RLS is enabled on `lots` and `orders` with no policies, and `anon` and
`authenticated` have no grants: only `service_role` (Edge Functions) can read or
write. `reserve_order` and `available_units` are executable by `service_role` only.
The `receipts` bucket is private (5 MB, jpeg/png/webp/pdf).

## Edge Functions

`get-lot`, `create-order`, `submit-receipt` (public, JWT verified) and
`telegram-webhook` (`verify_jwt = false`: Telegram sends no JWT, so it is
authenticated by the `secret_token` header; wrong/missing header gives 401, an
unset secret rejects everything). The webhook only accepts `callback_query`
from the owner's user id AND chat id, and always answers 200 to authenticated
requests so Telegram never retry-storms. Rejecting an order releases its stock
(`available_units` only counts pending/confirmed holds).

### Secrets

Copy `supabase/functions/.env.example` and fill it in; deploy with
`pnpm exec supabase secrets set --env-file supabase/functions/.env`.

| Secret | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | exact site origins for CORS |
| `IP_HASH_SALT` | long random string |
| `RATE_LIMIT_PER_HOUR` | create-order limit per IP |
| `CLIENT_IP_HEADER` | pin the platform client-IP header |
| `TELEGRAM_BOT_TOKEN` | bot token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | random string, also used as `secret_token` below |
| `OWNER_CHAT_ID` | owner's numeric Telegram id |
| `RESEND_API_KEY`, `OWNER_EMAIL`, `RESEND_FROM` | owner email notification |

### Register the Telegram webhook

```sh
curl -sS "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H 'content-type: application/json' \
  -d '{
    "url": "https://<project-ref>.supabase.co/functions/v1/telegram-webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["callback_query"]
  }'
```

### Keep-alive

`.github/workflows/keepalive.yml` pings `get-lot` every 3 days. Configure in
the GitHub repo: secrets `SUPABASE_FUNCTIONS_URL`
(`https://<project-ref>.supabase.co/functions/v1`) and `SUPABASE_ANON_KEY`, and
variable `LOT_SLUG`.

### Frontend build env

The site reads exactly three public vars at build time (see the root
`.env.example`). Set them in the hosting provider's build environment, then
redeploy: Vite inlines them, so changing them needs a new build.

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | project anon (public) key |
| `VITE_RESERVATIONS_ENABLED` | `true` to turn the flow on; anything else shows "proximamente" |

The origin the site is served from must be listed in `ALLOWED_ORIGINS`, or
every function call fails CORS.

### Go-live checklist

- [ ] Privacy policy (Ley 1581) and shipping terms published; the consent link in `OrderFormStep.jsx` points to it (today it is a dead `#politica-de-privacidad` anchor).
- [ ] Run pgTAP locally (`supabase start`, `supabase db reset`, `supabase test db`) and one end-to-end receipt upload before enabling the flag.
- [ ] Confirm the platform's client-IP header on the deployed function, then pin `CLIENT_IP_HEADER`.
- [ ] Set `RATE_LIMIT_PER_HOUR`, `IP_HASH_SALT` (random), `ALLOWED_ORIGINS` (production origin only).
- [ ] Service role key is injected by Supabase; never ship it to the client.
- [ ] `supabase db push` and `supabase functions deploy` (get-lot, create-order, submit-receipt, telegram-webhook).
- [ ] Lot row created with the upsert above (real Nequi number, holder/QR, price, stock), never in git; `get-lot` returns it.
- [ ] Telegram bot, `OWNER_CHAT_ID`, webhook secret, `setWebhook` done; `getWebhookInfo` shows the URL and no `last_error_message`.
- [ ] `OWNER_CHAT_ID` is the owner's personal user id (private chat with the bot), not a group id: taps are only accepted when both the tapping user and the chat match it.
- [ ] `RESEND_FROM` on a verified domain if emailing anyone other than the Resend account owner.
- [ ] GitHub keep-alive secrets/variable set; run the workflow once via `workflow_dispatch`. GitHub disables scheduled workflows after 60 days without repo activity, so re-enable it if that happens.
- [ ] Last step: set the three `VITE_*` vars with `VITE_RESERVATIONS_ENABLED=true` in the host build env and redeploy the site.

Known: if the client times out after the server already accepted a receipt, the
owner may get a duplicate Telegram message. Harmless: the decision webhook is
idempotent ("Ya procesado").
