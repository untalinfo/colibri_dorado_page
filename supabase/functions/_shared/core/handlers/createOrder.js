import { BodyTooLarge, MAX_BODY_BYTES, readCappedText } from '../body.js';
import { resolveClientIp as defaultResolveClientIp } from '../clientIp.js';
import { corsHeaders, handlePreflight } from '../cors.js';
import { mapRpcError } from '../errors.js';
import { errorResponse, jsonResponse } from '../http.js';
import { MAX_LENGTHS, validateOrderInput } from '../orderRules.js';
import { buildPayment } from '../payment.js';
import { generateReference } from '../reference.js';
import { generateToken, hashToken } from '../tokens.js';

export { MAX_BODY_BYTES };

const MAX_REF_ATTEMPTS = 3;
// Upper bound used only to read slug/honeypot before the lot (and its real max) is loaded.
const QTY_CEILING = 100;
const DEFAULT_RETRY_AFTER_SECONDS = 3600;
const NO_STORE = { 'cache-control': 'no-store' };
// Obviously fake values used only by the honeypot response. Never real data.
const FAKE_UNIT_PRICE_COP = 50000;
const FAKE_HOLD_MINUTES = 120;
const FAKE_NEQUI_NUMBER = '3000000000';

const isRefCollision = (error) =>
  error?.code === '23505' && /ref/i.test(`${error.message ?? ''} ${error.details ?? ''}`);

// Best effort: real lot price/hold make the fake 201 indistinguishable; any failure uses defaults.
async function honeypotLot(db, body) {
  try {
    const slug = typeof body.lotSlug === 'string' ? body.lotSlug.trim() : '';
    if (!slug || slug.length > MAX_LENGTHS.lotSlug) return null;
    return (await db.getLotWithAvailability(slug)) ?? null;
  } catch {
    return null;
  }
}

function fakeCreated(body, lot, cors) {
  const qty = Number.isInteger(body.qty) && body.qty >= 1 && body.qty <= QTY_CEILING ? body.qty : 1;
  const price = Number.isFinite(lot?.price_cop) ? lot.price_cop : FAKE_UNIT_PRICE_COP;
  const hold = Number.isFinite(lot?.hold_minutes) ? lot.hold_minutes : FAKE_HOLD_MINUTES;
  return jsonResponse(
    {
      ref: generateReference(),
      orderToken: generateToken(),
      total: qty * price,
      expiresAt: new Date(Date.now() + hold * 60000).toISOString(),
      upload: {
        signedUrl: `https://storage.invalid/receipts/${crypto.randomUUID()}?token=${generateToken()}`,
        path: `${crypto.randomUUID()}/receipt`,
      },
      payment: {
        nequiNumber: FAKE_NEQUI_NUMBER,
        holder: 'EXAMPLE HOLDER (FAKE)',
        qrUrl: 'https://example.invalid/qr.png',
        whatsapp: `https://wa.me/57${FAKE_NEQUI_NUMBER}`,
      },
    },
    201,
    { ...NO_STORE, ...cors },
  );
}

export function createCreateOrderHandler({
  db,
  storage,
  config,
  resolveClientIp = defaultResolveClientIp,
}) {
  return async (req) => {
    const preflight = handlePreflight(req, config.allowedOrigins);
    if (preflight) return preflight;
    const cors = corsHeaders(req.headers.get('origin'), config.allowedOrigins);
    const retryAfter =
      Number.isInteger(config.retryAfterSeconds) && config.retryAfterSeconds > 0
        ? config.retryAfterSeconds
        : DEFAULT_RETRY_AFTER_SECONDS;
    const fail = (status, code, message) => errorResponse(status, code, message, cors);

    if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST');
    // Config errors must never reach the RPC (a bad limit would disable throttling).
    if (!Number.isInteger(config.rateLimit) || config.rateLimit < 1) {
      return fail(500, 'INTERNAL', 'Unexpected error');
    }
    if (typeof config.ipSalt !== 'string' || !config.ipSalt) {
      return fail(500, 'INTERNAL', 'Unexpected error');
    }

    let body;
    try {
      body = JSON.parse(await readCappedText(req, MAX_BODY_BYTES));
    } catch (e) {
      if (e instanceof BodyTooLarge) return fail(413, 'PAYLOAD_TOO_LARGE', 'Body too large');
      return fail(400, 'INVALID_INPUT', 'Invalid JSON');
    }

    try {
      const pre = validateOrderInput(body, QTY_CEILING);
      if (pre.ok && pre.honeypot) {
        // Looks like success (same shape as a real 201); nothing is created, no real data exposed.
        return fakeCreated(body, await honeypotLot(db, body), cors);
      }
      if (!pre.ok) return fail(400, 'INVALID_INPUT', 'Invalid order data');

      const lot = await db.getLotWithAvailability(pre.value.lotSlug);
      if (!lot?.active) return fail(404, 'LOT_UNAVAILABLE', 'Lot not available');

      // Throws TypeError on a bad lot config -> 500 below.
      const checked = validateOrderInput(body, lot.max_per_order);
      if (!checked.ok) return fail(400, 'INVALID_INPUT', 'Invalid order data');
      const { value } = checked;

      const orderToken = generateToken();
      const tokenHash = await hashToken(orderToken);
      const ip = resolveClientIp(req.headers) || 'unknown';
      const ipHash = await hashToken(`${ip}${config.ipSalt}`);

      let order = null;
      for (let attempt = 0; attempt < MAX_REF_ATTEMPTS && !order; attempt++) {
        const { data, error } = await db.reserveOrder({
          lotSlug: value.lotSlug,
          qty: value.qty,
          customer: value.customer,
          ref: generateReference(),
          tokenHash,
          ipHash,
          rateLimit: config.rateLimit,
        });
        if (!error) order = data;
        else if (!isRefCollision(error)) {
          const { status, code } = mapRpcError(error);
          const headers = status === 429 ? { 'retry-after': String(retryAfter) } : {};
          const extra =
            code === 'OUT_OF_STOCK'
              ? { available: Number.isFinite(lot.available) ? Math.max(0, lot.available) : 0 }
              : {};
          return errorResponse(
            status,
            code,
            'Could not create order',
            { ...headers, ...cors },
            extra,
          );
        }
      }
      if (!order) return fail(500, 'INTERNAL', 'Unexpected error');

      let upload;
      try {
        upload = await storage.createSignedUpload(`${order.id}/receipt`);
      } catch {
        // Do not leave an orphan hold; a release failure must not change the answer.
        try {
          await db.releaseOrder(order.id);
        } catch {
          // best effort: the hold still expires on its own
        }
        return fail(500, 'INTERNAL', 'Unexpected error');
      }
      const expiresAt = new Date(
        new Date(order.created_at).getTime() + lot.hold_minutes * 60000,
      ).toISOString();

      return jsonResponse(
        {
          ref: order.ref,
          orderToken,
          total: order.total_cop,
          expiresAt,
          upload: { signedUrl: upload.signedUrl, path: upload.path },
          payment: buildPayment(lot),
        },
        201,
        { ...NO_STORE, ...cors },
      );
    } catch {
      return fail(500, 'INTERNAL', 'Unexpected error');
    }
  };
}
