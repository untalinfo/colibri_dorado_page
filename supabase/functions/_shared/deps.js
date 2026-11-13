// Deno-side wiring: real dependencies from env. Not unit-tested (I/O only); covered by the smoke run.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveClientIp as defaultResolveClientIp } from './core/clientIp.js';

const BUCKET = 'receipts';
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
  };

  const storage = {
    async createSignedUpload(path) {
      const data = must(
        await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true }),
      );
      return { signedUrl: data.signedUrl, path: data.path ?? path };
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

  // S2c: no-op. S3 swaps in Telegram/Resend.
  const notifier = { orderSubmitted: async () => {} };

  return { db, storage, notifier, config: loadConfig(), resolveClientIp: loadClientIpResolver() };
}
