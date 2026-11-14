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

### Go-live checklist

- [ ] Confirm the platform's client-IP header on the deployed function, then pin `CLIENT_IP_HEADER`.
- [ ] Set `RATE_LIMIT_PER_HOUR`, `IP_HASH_SALT` (random), `ALLOWED_ORIGINS` (production origin only).
- [ ] Service role key is injected by Supabase; never ship it to the client.
- [ ] Real Nequi number, holder/QR and stock set via SQL (see above), never in git.
- [ ] `supabase db push` and `supabase functions deploy` (get-lot, create-order, submit-receipt, telegram-webhook).
- [ ] Telegram bot, `OWNER_CHAT_ID`, webhook secret, `setWebhook` done; `getWebhookInfo` shows the URL and no `last_error_message`.
- [ ] `OWNER_CHAT_ID` is the owner's personal user id (private chat with the bot), not a group id: taps are only accepted when both the tapping user and the chat match it.
- [ ] `RESEND_FROM` on a verified domain if emailing anyone other than the Resend account owner.
- [ ] GitHub keep-alive secrets/variable set; run the workflow once via `workflow_dispatch`. GitHub disables scheduled workflows after 60 days without repo activity, so re-enable it if that happens.

Known: if the client times out after the server already accepted a receipt, the
owner may get a duplicate Telegram message. Harmless: the decision webhook is
idempotent ("Ya procesado").
