// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { hashToken } from '../tokens.js';
import { createSubmitReceiptHandler } from './submitReceipt.js';

const ORIGIN = 'https://shop.example';
const TOKEN = 'valid-token-value';
const NUMBER = '3012345678';
const fresh = () => new Date(Date.now() - 10 * 60000).toISOString();
const stale = () => new Date(Date.now() - 500 * 60000).toISOString();

const orderRow = (over = {}) => ({
  id: 'order-uuid',
  ref: 'CD-AAAAAA',
  status: 'pending_payment',
  created_at: fresh(),
  hold_minutes: 120,
  nequi_number: NUMBER,
  nequi_holder: 'PLACEHOLDER HOLDER',
  nequi_qr_url: 'https://qr.example/x.png',
  ...over,
});

const setup = (
  { order = orderRow(), stat = { size: 1000, mime: 'image/png' } } = {},
  config = {},
) => {
  const db = {
    findOrderByRefAndTokenHash: vi.fn().mockResolvedValue(order),
    markPendingVerification: vi
      .fn()
      .mockResolvedValue({ ...order, status: 'pending_verification' }),
  };
  const storage = {
    statObject: vi.fn().mockResolvedValue(stat),
    createSignedUpload: vi
      .fn()
      .mockResolvedValue({ signedUrl: 'https://up.example/s', path: 'order-uuid/receipt' }),
  };
  const notifier = { orderSubmitted: vi.fn().mockResolvedValue(undefined) };
  const handler = createSubmitReceiptHandler({
    db,
    storage,
    notifier,
    config: { allowedOrigins: [ORIGIN], ...config },
  });
  const post = (body = { ref: 'CD-AAAAAA', orderToken: TOKEN, action: 'submit' }, raw) =>
    handler(
      new Request('https://fn.example/submit-receipt', {
        method: 'POST',
        headers: { origin: ORIGIN },
        body: raw ?? JSON.stringify(body),
      }),
    );
  return { db, storage, notifier, handler, post };
};

describe('submitReceipt handler', () => {
  it('submit: 200, pending_verification, notifies once, looks up by token hash', async () => {
    const { post, db, notifier } = setup();
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      order: { ref: 'CD-AAAAAA', status: 'pending_verification' },
    });
    expect(db.findOrderByRefAndTokenHash).toHaveBeenCalledWith('CD-AAAAAA', await hashToken(TOKEN));
    expect(db.markPendingVerification).toHaveBeenCalledWith('order-uuid', {
      receiptPath: 'order-uuid/receipt',
      receiptMime: 'image/png',
    });
    expect(notifier.orderSubmitted).toHaveBeenCalledTimes(1);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it.each([
    ['missing', { ref: 'CD-AAAAAA', action: 'submit' }],
    ['empty', { ref: 'CD-AAAAAA', orderToken: '', action: 'submit' }],
    ['blank', { ref: 'CD-AAAAAA', orderToken: '   ', action: 'submit' }],
    ['non-string', { ref: 'CD-AAAAAA', orderToken: 5, action: 'submit' }],
    ['huge', { ref: 'CD-AAAAAA', orderToken: 'x'.repeat(300), action: 'submit' }],
  ])('rejects %s token with 400 before hashing or looking up', async (_n, body) => {
    const { post, db } = setup();
    expect((await post(body)).status).toBe(400);
    expect(db.findOrderByRefAndTokenHash).not.toHaveBeenCalled();
  });

  it.each([
    ['bad action', { ref: 'CD-AAAAAA', orderToken: TOKEN, action: 'delete' }],
    ['bad ref', { ref: 'nope', orderToken: TOKEN, action: 'submit' }],
    ['non-object', 'str'],
  ])('400 on %s', async (_n, body) => {
    const { post, db } = setup();
    expect((await post(body)).status).toBe(400);
    expect(db.findOrderByRefAndTokenHash).not.toHaveBeenCalled();
  });

  it('400 on invalid JSON, 413 on oversize, 405 on GET', async () => {
    const { post, handler } = setup();
    expect((await post(undefined, '{bad')).status).toBe(400);
    expect((await post(undefined, JSON.stringify({ pad: 'x'.repeat(17 * 1024) }))).status).toBe(
      413,
    );
    const res = await handler(new Request('https://fn.example/x', { headers: { origin: ORIGIN } }));
    expect(res.status).toBe(405);
  });

  it('answers preflight', async () => {
    const { handler } = setup();
    const res = await handler(
      new Request('https://fn.example/x', { method: 'OPTIONS', headers: { origin: ORIGIN } }),
    );
    expect(res.status).toBe(204);
  });

  it('unknown ref and wrong token produce identical 404 bodies', async () => {
    const a = setup({ order: null });
    const res = await a.post();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(a.db.markPendingVerification).not.toHaveBeenCalled();
    expect(a.notifier.orderSubmitted).not.toHaveBeenCalled();
    const b = setup({ order: null });
    expect(
      await (await b.post({ ref: 'CD-ZZZZZZ', orderToken: 'other', action: 'renew' })).json(),
    ).toEqual(body);
  });

  it('submit on expired by time: 410, no transition', async () => {
    const { post, db } = setup({ order: orderRow({ created_at: stale() }) });
    const res = await post();
    expect(res.status).toBe(410);
    expect((await res.json()).error.code).toBe('HOLD_EXPIRED');
    expect(db.markPendingVerification).not.toHaveBeenCalled();
  });

  it('submit on explicitly expired: 410', async () => {
    const { post } = setup({ order: orderRow({ status: 'expired' }) });
    expect((await post()).status).toBe(410);
  });

  it.each(['confirmed', 'rejected'])('submit on %s: 409', async (status) => {
    const { post, db } = setup({ order: orderRow({ status }) });
    expect((await post()).status).toBe(409);
    expect(db.markPendingVerification).not.toHaveBeenCalled();
  });

  it('repeat submit on pending_verification: 200 same body, no notify, no write', async () => {
    const { post, db, notifier, storage } = setup({
      order: orderRow({ status: 'pending_verification', created_at: stale() }),
    });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      order: { ref: 'CD-AAAAAA', status: 'pending_verification' },
    });
    expect(db.markPendingVerification).not.toHaveBeenCalled();
    expect(notifier.orderSubmitted).not.toHaveBeenCalled();
    expect(storage.statObject).not.toHaveBeenCalled();
  });

  it.each([
    ['missing object', null],
    ['bad mime', { size: 1000, mime: 'text/html' }],
    ['oversize', { size: 6 * 1024 * 1024, mime: 'image/png' }],
    ['empty', { size: 0, mime: 'image/png' }],
  ])('400 RECEIPT_MISSING on %s', async (_n, stat) => {
    const { post, db } = setup({ stat });
    const res = await post();
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('RECEIPT_MISSING');
    expect(db.markPendingVerification).not.toHaveBeenCalled();
  });

  it('accepts a mime with parameters and stores the bare type', async () => {
    const { post, db } = setup({ stat: { size: 1000, mime: 'Image/PNG; charset=binary' } });
    expect((await post()).status).toBe(200);
    expect(db.markPendingVerification.mock.calls[0][1].receiptMime).toBe('image/png');
  });

  it('race: conditional update loses, order is now pending_verification -> 200, no notify', async () => {
    const { post, db, notifier } = setup();
    db.markPendingVerification.mockResolvedValue(null);
    db.findOrderByRefAndTokenHash
      .mockResolvedValueOnce(orderRow())
      .mockResolvedValueOnce(orderRow({ status: 'pending_verification' }));
    expect((await post()).status).toBe(200);
    expect(notifier.orderSubmitted).not.toHaveBeenCalled();
  });

  it('race: conditional update loses and state is something else -> 409', async () => {
    const { post, db } = setup();
    db.markPendingVerification.mockResolvedValue(null);
    db.findOrderByRefAndTokenHash
      .mockResolvedValueOnce(orderRow())
      .mockResolvedValueOnce(orderRow({ status: 'expired' }));
    expect((await post()).status).toBe(409);
  });

  it('notifier failure (reject or sync throw) never blocks the transition', async () => {
    for (const impl of [
      () => Promise.reject(new Error('down')),
      () => {
        throw new Error('sync');
      },
    ]) {
      const { post, notifier } = setup();
      notifier.orderSubmitted.mockImplementation(impl);
      expect((await post()).status).toBe(200);
    }
  });

  it('500 when storage stat or db throws', async () => {
    const a = setup();
    a.storage.statObject.mockRejectedValue(new Error('x'));
    expect((await a.post()).status).toBe(500);
    const b = setup();
    b.db.findOrderByRefAndTokenHash.mockRejectedValue(new Error('x'));
    const res = await b.post();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('x"');
  });

  it('renew: fresh signed upload + payment from lot row + expiresAt, no-store', async () => {
    const { post, storage, db } = setup();
    const res = await post({ ref: 'CD-AAAAAA', orderToken: TOKEN, action: 'renew' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.upload).toEqual({ signedUrl: 'https://up.example/s', path: 'order-uuid/receipt' });
    expect(body.payment).toEqual({
      nequiNumber: NUMBER,
      holder: 'PLACEHOLDER HOLDER',
      qrUrl: 'https://qr.example/x.png',
      whatsapp: `https://wa.me/57${NUMBER}`,
    });
    expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(storage.createSignedUpload).toHaveBeenCalledWith('order-uuid/receipt');
    expect(db.markPendingVerification).not.toHaveBeenCalled();
  });

  it('renew: expired -> 410, wrong state -> 409, no payment data leaked', async () => {
    const a = setup({ order: orderRow({ created_at: stale() }) });
    const r1 = await a.post({ ref: 'CD-AAAAAA', orderToken: TOKEN, action: 'renew' });
    expect(r1.status).toBe(410);
    expect(await r1.text()).not.toContain(NUMBER);
    const b = setup({ order: orderRow({ status: 'pending_verification' }) });
    expect((await b.post({ ref: 'CD-AAAAAA', orderToken: TOKEN, action: 'renew' })).status).toBe(
      409,
    );
    expect(b.storage.createSignedUpload).not.toHaveBeenCalled();
  });

  it('renew: signing failure -> 500', async () => {
    const { post, storage } = setup();
    storage.createSignedUpload.mockRejectedValue(new Error('x'));
    expect((await post({ ref: 'CD-AAAAAA', orderToken: TOKEN, action: 'renew' })).status).toBe(500);
  });
});
