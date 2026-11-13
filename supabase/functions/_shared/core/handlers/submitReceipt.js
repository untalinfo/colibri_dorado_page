import { BodyTooLarge, MAX_BODY_BYTES, readCappedText } from '../body.js';
import { corsHeaders, handlePreflight } from '../cors.js';
import { errorResponse, jsonResponse } from '../http.js';
import { buildPayment } from '../payment.js';
import { hashToken } from '../tokens.js';
import { isExpired } from '../transitions.js';

const REF_RE = /^CD-[A-Z0-9]{6}$/;
const MAX_TOKEN_LENGTH = 256;
const ACTIONS = new Set(['submit', 'renew']);
// Mirror of the receipts bucket rules (migration); the bucket enforces them on upload too.
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const NO_STORE = { 'cache-control': 'no-store' };

const receiptPath = (order) => `${order.id}/receipt`;
const submittedBody = (order) => ({ order: { ref: order.ref, status: 'pending_verification' } });

export function createSubmitReceiptHandler({ db, storage, notifier, config }) {
  return async (req) => {
    const preflight = handlePreflight(req, config.allowedOrigins);
    if (preflight) return preflight;
    const cors = corsHeaders(req.headers.get('origin'), config.allowedOrigins);
    const fail = (status, code, message) => errorResponse(status, code, message, cors);
    const ok = (body) => jsonResponse(body, 200, { ...NO_STORE, ...cors });

    if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST');

    let body;
    try {
      body = JSON.parse(await readCappedText(req, MAX_BODY_BYTES));
    } catch (e) {
      if (e instanceof BodyTooLarge) return fail(413, 'PAYLOAD_TOO_LARGE', 'Body too large');
      return fail(400, 'INVALID_JSON', 'Invalid JSON');
    }

    const { ref, orderToken, action } = body && typeof body === 'object' ? body : {};
    // Reject before hashing: String(undefined) must never become a valid-looking token.
    const token = typeof orderToken === 'string' ? orderToken.trim() : '';
    if (
      typeof ref !== 'string' ||
      !REF_RE.test(ref) ||
      !token ||
      token.length > MAX_TOKEN_LENGTH ||
      !ACTIONS.has(action)
    ) {
      return fail(400, 'INVALID_INPUT', 'Invalid request');
    }

    try {
      const tokenHash = await hashToken(token);
      const order = await db.findOrderByRefAndTokenHash(ref, tokenHash);
      // Same answer for unknown ref and wrong token so refs cannot be enumerated.
      if (!order) return fail(404, 'NOT_FOUND', 'Order not found');

      if (action === 'submit' && order.status === 'pending_verification') {
        return ok(submittedBody(order));
      }
      if (isExpired(order, order.hold_minutes)) {
        return fail(410, 'HOLD_EXPIRED', 'Reservation expired');
      }
      if (order.status !== 'pending_payment') return fail(409, 'INVALID_STATE', 'Invalid state');

      if (action === 'renew') {
        const upload = await storage.createSignedUpload(receiptPath(order));
        return ok({
          upload: { signedUrl: upload.signedUrl, path: upload.path },
          payment: buildPayment(order),
          expiresAt: new Date(
            new Date(order.created_at).getTime() + order.hold_minutes * 60000,
          ).toISOString(),
        });
      }

      const path = receiptPath(order);
      const stat = await storage.statObject(path);
      const mime = String(stat?.mime ?? '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!stat || !ALLOWED_MIME.has(mime) || !(stat.size > 0) || stat.size > MAX_RECEIPT_BYTES) {
        return fail(400, 'RECEIPT_MISSING', 'Receipt missing or invalid');
      }

      const updated = await db.markPendingVerification(order.id, {
        receiptPath: path,
        receiptMime: mime,
      });
      if (!updated) {
        // Lost a race: only an already-submitted order counts as success, and never re-notifies.
        const current = await db.findOrderByRefAndTokenHash(ref, tokenHash);
        if (current?.status === 'pending_verification') return ok(submittedBody(order));
        return fail(409, 'INVALID_STATE', 'Invalid state');
      }

      try {
        await notifier.orderSubmitted({
          ...order,
          status: 'pending_verification',
          receipt_path: path,
          receipt_mime: mime,
        });
      } catch {
        // A notification failure must never undo or block the transition.
      }
      return ok(submittedBody(order));
    } catch {
      return fail(500, 'INTERNAL', 'Unexpected error');
    }
  };
}
