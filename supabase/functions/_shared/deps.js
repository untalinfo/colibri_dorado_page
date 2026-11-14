// Deno-side wiring: real dependencies from env. Not unit-tested (I/O only); covered by the smoke run.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseAdminIds } from './core/admin/admins.js';
import { resolveClientIp as defaultResolveClientIp } from './core/clientIp.js';
import { createEmailChannel } from './core/notify/email.js';
import { createNotifier } from './core/notify/notifier.js';
import { createTelegramChannel, createTelegramClient } from './core/notify/telegram.js';
import { toPublicUrl } from './core/publicUrl.js';

const BUCKET = 'receipts';
const ORDER_DECISION_COLUMNS =
  'id, ref, status, qty, total_cop, customer_name, customer_phone, customer_address, decided_at, decided_by, decided_by_name';
const ORDER_VIEW_COLUMNS =
  'ref, status, qty, total_cop, customer_name, customer_phone, customer_address, created_at, decided_at, decided_by_name, lots(code)';
const LOT_COLUMNS =
  'id, slug, name, price_cop, max_per_order, hold_minutes, active, nequi_number, nequi_holder, nequi_qr_url';

const required = (name) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
};

// Fail closed: a missing/invalid value yields NaN or empty, which handlers answer with 500/no CORS.
export function loadConfig() {
  return {
    rateLimit: Number.parseInt(Deno.env.get('RATE_LIMIT_PER_HOUR') ?? '', 10),
    retryAfterSeconds: Number.parseInt(Deno.env.get('RETRY_AFTER_SECONDS') ?? '', 10) || undefined,
    ipSalt: Deno.env.get('IP_HASH_SALT') ?? '',
    allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}

// CLIENT_IP_HEADER pins the platform header once confirmed on deploy; otherwise the default resolver.
export function loadClientIpResolver() {
  const header = Deno.env.get('CLIENT_IP_HEADER')?.trim().toLowerCase();
  if (!header) return defaultResolveClientIp;
  return (headers) =>
    defaultResolveClientIp(new Headers({ 'x-real-ip': headers.get(header) ?? '' }));
}

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// Keeps the isolate alive after the response when the platform supports it; the promise is
// already error-isolated by the handler, so plain fire-and-forget is a safe fallback.
export function runInBackground(promise) {
  globalThis.EdgeRuntime?.waitUntil?.(promise);
}

export const log = (event, fields) => console.warn(JSON.stringify({ event, ...fields }));

export function telegramClientFromEnv() {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  return token ? createTelegramClient({ token, fetch }) : null;
}

// ADMIN_CHAT_IDS, with OWNER_CHAT_ID as the single-admin fallback only while it is unset/blank.
export function loadAdminIds() {
  return parseAdminIds(Deno.env.get('ADMIN_CHAT_IDS'), Deno.env.get('OWNER_CHAT_ID'));
}

// A channel with missing config is disabled (logged), never a crash.
export function buildNotifier(storage, db) {
  const env = (name) => Deno.env.get(name)?.trim();
  const client = telegramClientFromEnv();
  const chatIds = loadAdminIds();
  const telegram =
    client && chatIds.length > 0 ? createTelegramChannel({ client, chatIds, log }) : null;
  if (!telegram) log('channel_disabled', { channel: 'telegram' });

  const apiKey = env('RESEND_API_KEY');
  const to = env('OWNER_EMAIL');
  const email =
    apiKey && to
      ? createEmailChannel({ apiKey, to, from: env('RESEND_FROM') || undefined, fetch })
      : null;
  if (!email) log('channel_disabled', { channel: 'email' });

  return createNotifier({
    telegram,
    email,
    signReceiptUrl: (path, seconds) => storage.createSignedReadUrl(path, seconds),
    recordAlerts: (orderId, sent) =>
      db.saveAdminMessages(
        orderId,
        sent
          .filter((s) => s.messageId != null)
          .map((s) => ({ chat_id: s.chatId, message_id: s.messageId, has_media: s.hasMedia })),
      ),
    log,
  });
}

export function loadWebhookConfig() {
  return {
    webhookSecret: Deno.env.get('TELEGRAM_WEBHOOK_SECRET')?.trim() ?? '',
    adminIds: loadAdminIds(),
  };
}

// Notifiers are NOT built here: only submit-receipt needs them (see its shell), so get-lot and
// create-order never construct channels or log channel_disabled.
export function buildDeps() {
  const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const db = {
    async getLotWithAvailability(slug) {
      const lot = must(
        await supabase.from('lots').select(LOT_COLUMNS).eq('slug', slug).maybeSingle(),
      );
      if (!lot) return null;
      const available = must(await supabase.rpc('available_units', { p_lot_id: lot.id }));
      return { ...lot, available };
    },
    // Returns { data, error } as-is: the handler maps RPC errors itself.
    reserveOrder: (a) =>
      supabase.rpc('reserve_order', {
        p_lot_slug: a.lotSlug,
        p_qty: a.qty,
        p_customer: a.customer,
        p_ref: a.ref,
        p_token_hash: a.tokenHash,
        p_ip_hash: a.ipHash,
        p_rate_limit: a.rateLimit,
      }),
    async releaseOrder(id) {
      must(
        await supabase
          .from('orders')
          .update({ status: 'expired' })
          .eq('id', id)
          .eq('status', 'pending_payment'),
      );
    },
    async findOrderByRefAndTokenHash(ref, tokenHash) {
      const row = must(
        await supabase
          .from('orders')
          .select(
            'id, ref, status, created_at, qty, total_cop, customer_name, customer_phone, customer_address, customer_email, lots(hold_minutes, nequi_number, nequi_holder, nequi_qr_url)',
          )
          .eq('ref', ref)
          .eq('order_token_hash', tokenHash)
          .maybeSingle(),
      );
      if (!row) return null;
      const { lots, ...order } = row;
      return { ...order, ...lots };
    },
    // Conditional on current status so concurrent submits transition exactly once.
    async markPendingVerification(id, { receiptPath, receiptMime }) {
      return must(
        await supabase
          .from('orders')
          .update({
            status: 'pending_verification',
            receipt_path: receiptPath,
            receipt_mime: receiptMime,
            receipt_submitted_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('status', 'pending_payment')
          .select('id')
          .maybeSingle(),
      );
    },
    // Conditional on pending_verification: a double tap or any other state changes nothing.
    // `rejected` drops out of available_units, so the held stock is released. On a lost race the
    // current order is returned so the tapped copy can be synced to the winner's decision.
    async setDecision(ref, status, adminId, adminName) {
      const row = must(
        await supabase
          .from('orders')
          .update({
            status,
            decided_at: new Date().toISOString(),
            decided_by: adminId,
            decided_by_name: adminName,
          })
          .eq('ref', ref)
          .eq('status', 'pending_verification')
          .select(ORDER_DECISION_COLUMNS)
          .maybeSingle(),
      );
      if (row) return { changed: true, order: row };
      const order = must(
        await supabase.from('orders').select(ORDER_DECISION_COLUMNS).eq('ref', ref).maybeSingle(),
      );
      return { changed: false, order };
    },
    // Read-only admin queries: explicit columns, nequi_* is never selected.
    async lotOverview() {
      return must(await supabase.rpc('lot_overview'));
    },
    async listPending(limit) {
      return must(
        await supabase
          .from('orders')
          .select(ORDER_VIEW_COLUMNS)
          .eq('status', 'pending_verification')
          .order('created_at', { ascending: false })
          .limit(limit),
      );
    },
    async getOrder(ref) {
      return must(
        await supabase.from('orders').select(ORDER_VIEW_COLUMNS).eq('ref', ref).maybeSingle(),
      );
    },
    async saveAdminMessages(orderId, rows) {
      if (rows.length === 0) return;
      must(
        await supabase.from('order_admin_messages').upsert(
          rows.map((r) => ({ order_id: orderId, ...r })),
          { onConflict: 'order_id,chat_id' },
        ),
      );
    },
    async listAdminMessages(orderId) {
      return must(
        await supabase
          .from('order_admin_messages')
          .select('chat_id, message_id, has_media')
          .eq('order_id', orderId),
      );
    },
  };

  const publicUrl = (url) =>
    toPublicUrl(url, Deno.env.get('SUPABASE_URL'), Deno.env.get('PUBLIC_SUPABASE_URL'));

  const storage = {
    async createSignedUpload(path) {
      const data = must(
        await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true }),
      );
      return { signedUrl: publicUrl(data.signedUrl), path: data.path ?? path };
    },
    async createSignedReadUrl(path, seconds) {
      const data = must(await supabase.storage.from(BUCKET).createSignedUrl(path, seconds));
      return publicUrl(data.signedUrl);
    },
    async statObject(path) {
      const slash = path.lastIndexOf('/');
      const dir = path.slice(0, slash);
      const name = path.slice(slash + 1);
      const files = must(
        await supabase.storage.from(BUCKET).list(dir, { limit: 10, search: name }),
      );
      const file = files.find((f) => f.name === name);
      return file ? { size: file.metadata?.size, mime: file.metadata?.mimetype } : null;
    },
  };

  return {
    db,
    storage,
    config: loadConfig(),
    resolveClientIp: loadClientIpResolver(),
  };
}
