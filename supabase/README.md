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
| `ADMIN_CHAT_IDS` | comma-separated numeric private chat ids of the admins; each gets the order alert and can confirm/reject. Set but without any valid id = fail closed |
| `OWNER_CHAT_ID` | deprecated single-admin fallback, used only when `ADMIN_CHAT_IDS` is unset/blank |
| `RESEND_API_KEY`, `OWNER_EMAIL`, `RESEND_FROM` | owner email notification |

### Register the Telegram webhook

```sh
curl -sS "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H 'content-type: application/json' \
  -d '{
    "url": "https://<project-ref>.supabase.co/functions/v1/telegram-webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
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
- [ ] Telegram bot, `ADMIN_CHAT_IDS`, webhook secret, `setWebhook` done; `getWebhookInfo` shows the URL and no `last_error_message`.
- [ ] Every `ADMIN_CHAT_IDS` entry is an admin's personal user id (private chat with the bot, who has pressed Start), not a group id: taps are only accepted when both the tapping user and the chat match one of them.
- [ ] `RESEND_FROM` on a verified domain if emailing anyone other than the Resend account owner.
- [ ] GitHub keep-alive secrets/variable set; run the workflow once via `workflow_dispatch`. GitHub disables scheduled workflows after 60 days without repo activity, so re-enable it if that happens.
- [ ] Last step: set the three `VITE_*` vars with `VITE_RESERVATIONS_ENABLED=true` in the host build env and redeploy the site.

Known: if the client times out after the server already accepted a receipt, the
owner may get a duplicate Telegram message. Harmless: the decision webhook is
idempotent ("Ya procesado").

## Telegram admin bot: S1 (multi-admin alerts)

Deploy order: apply migration `20261114000001_admin_bot_s1.sql`, set `ADMIN_CHAT_IDS`
(keep `OWNER_CHAT_ID` until released), then deploy `telegram-webhook` and
`submit-receipt`. Publish the updated privacy policy before or with the functions.
Each admin gets the alert; a decision edits every admin's copy ("Confirmado por
{name}") and stores `orders.decided_by`.

Rollback: redeploy the previous functions, then run the S1 section of
`supabase/rollback/admin_bot.down.sql` (sections are run in reverse, S4 to S1).

## Telegram admin bot: S2 (read commands)

Deploy order: apply migration `20261114000002_admin_bot_s2.sql`, give the live lot its
command code, deploy `telegram-webhook`, then re-run `setWebhook` (above) so
`allowed_updates` includes `message`.

```sql
update lots set code = 'm500' where slug = 'miel-colibri-500g';
```

Commands: `/ayuda`, `/lotes`, `/pendientes`, `/pedido <ref>`. They work only from an
admin's own private chat; anyone else gets no reply. `/lotes` lists only lots that
have a code. Register the menu per admin and clear the default one:

```sh
curl -sS "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setMyCommands" \
  -H 'content-type: application/json' \
  -d '{
    "scope": {"type": "chat", "chat_id": <ADMIN_CHAT_ID>},
    "commands": [
      {"command": "ayuda", "description": "Lista de comandos"},
      {"command": "lotes", "description": "Lotes y disponibilidad"},
      {"command": "pendientes", "description": "Pedidos por verificar"},
      {"command": "pedido", "description": "Ver un pedido: /pedido CD-XXXXXX"}
    ]
  }'
curl -sS "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/deleteMyCommands" \
  -H 'content-type: application/json' -d '{"scope": {"type": "default"}}'
```

Rollback: redeploy the previous functions, `setWebhook` with
`"allowed_updates": ["callback_query"]`, `deleteMyCommands` per admin, then run the S2
section of `supabase/rollback/admin_bot.down.sql`.

## Telegram admin bot: S3 (stock adjustments)

Deploy order: apply migration `20261114000003_admin_bot_s3.sql`, then deploy
`telegram-webhook`.

Commands (admin private chat only, plain-text replies, every change is audited and
idempotent per Telegram update):

- `/agregar <código> <n>`: add `n` units (1 to 10000), e.g. `/agregar m500 24`.
- `/corregir <código> <±n> [motivo]`: signed correction, e.g. `/corregir m500 -2 se rompió`.
  A reduction below the units held by open orders is rejected and the reply states the
  maximum allowed reduction.

Add both to the per-admin menu by appending these entries to the `setMyCommands` list above:

```json
{"command": "agregar", "description": "Sumar stock: /agregar m500 24"},
{"command": "corregir", "description": "Corregir stock: /corregir m500 -2 motivo"}
```

Rollback: redeploy the previous functions, re-run `setMyCommands` without the two entries,
then run the S3 section of `supabase/rollback/admin_bot.down.sql`.

## Telegram admin bot: S4 (lot changes and summary)

Deploy order: apply migration `20261114000004_admin_bot_s4.sql`, then deploy
`telegram-webhook`.

Commands (admin private chat only, plain text, audited and idempotent per update):

- `/precio <código> <cop>`: new price, `38000` or `38.000` (1.000 to 1.000.000 COP, no
  decimals). Existing orders keep the price they were created with.
- `/pausar <código>` / `/reanudar <código>`: hide or reopen a lot. A paused lot is
  rejected by the public `get-lot` and reserve flow (`LOT_UNAVAILABLE`); stock already
  held by open orders is kept.
- `/resumen [días]`: orders, units and confirmed revenue per status, default 7 days (1 to 31).

Append these entries to the per-admin `setMyCommands` list:

```json
{"command": "precio", "description": "Cambiar precio: /precio m500 42000"},
{"command": "pausar", "description": "Pausar lote: /pausar m500"},
{"command": "reanudar", "description": "Reanudar lote: /reanudar m500"},
{"command": "resumen", "description": "Resumen de ventas: /resumen 7"}
```

Follow-up (GL4.5): once `ADMIN_CHAT_IDS` is set in production and one release has run
cleanly, remove the `OWNER_CHAT_ID` fallback and delete that secret.

Rollback: redeploy the previous functions, re-run `setMyCommands` without the four entries,
then run the S4 section of `supabase/rollback/admin_bot.down.sql` (first, before S3).
