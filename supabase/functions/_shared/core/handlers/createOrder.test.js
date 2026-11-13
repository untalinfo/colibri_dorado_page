// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { hashToken } from '../tokens.js';
import { createCreateOrderHandler } from './createOrder.js';

const ORIGIN = 'https://shop.example';
const NUMBER = '3012345678';

const lotRow = {
  slug: 'lot-1',
  name: 'Lot One',
  price_cop: 50000,
  max_per_order: 6,
  hold_minutes: 120,
  active: true,
  available: 4,
  nequi_number: NUMBER,
  nequi_holder: 'PLACEHOLDER HOLDER',
  nequi_qr_url: 'https://qr.example/x.png',
};
const orderRow = {
  id: 'order-uuid',
  ref: 'CD-AAAAAA',
  total_cop: 100000,
  created_at: '2026-01-01T00:00:00.000Z',
};
const validBody = {
  lotSlug: 'lot-1',
  qty: 2,
  customer: { name: 'Ana Perez', phone: '3001234567', address: 'Calle 1 #2-3, Bogota' },
  consent: true,
  website: '',
};

const setup = (overrides = {}, deps = {}) => {
  const db = {
    getLotWithAvailability: vi.fn().mockResolvedValue(lotRow),
    reserveOrder: vi.fn().mockResolvedValue({ data: orderRow, error: null }),
    releaseOrder: vi.fn().mockResolvedValue(undefined),
  };
  const storage = {
    createSignedUpload: vi
      .fn()
      .mockResolvedValue({ signedUrl: 'https://up.example/s', path: 'order-uuid/receipt' }),
  };
  const config = { rateLimit: 5, allowedOrigins: [ORIGIN], ipSalt: 'salt', ...overrides };
  const handler = createCreateOrderHandler({ db, storage, config, ...deps });
  const post = (body = validBody, headers = {}, raw) =>
    handler(
      new Request('https://fn.example/create-order', {
        method: 'POST',
        headers: { origin: ORIGIN, 'x-forwarded-for': '1.2.3.4, 5.6.7.8', ...headers },
        body: raw ?? JSON.stringify(body),
      }),
    );
  return { db, storage, handler, post };
};

describe('createOrder handler', () => {
  it('201 with order, token, upload and payment data from the lot row', async () => {
    const { post, storage } = setup();
    const res = await post();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      ref: 'CD-AAAAAA',
      total: 100000,
      expiresAt: '2026-01-01T02:00:00.000Z',
      upload: { signedUrl: 'https://up.example/s', path: 'order-uuid/receipt' },
      payment: {
        nequiNumber: NUMBER,
        holder: 'PLACEHOLDER HOLDER',
        qrUrl: 'https://qr.example/x.png',
        whatsapp: `https://wa.me/57${NUMBER}`,
      },
    });
    expect(body.orderToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storage.createSignedUpload).toHaveBeenCalledWith('order-uuid/receipt');
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('stores only the token hash, a salted ip hash and the configured rate limit', async () => {
    const { post, db } = setup();
    const body = await (await post()).json();
    const args = db.reserveOrder.mock.calls[0][0];
    expect(args.tokenHash).toBe(await hashToken(body.orderToken));
    expect(args.tokenHash).not.toBe(body.orderToken);
    expect(args.ipHash).toBe(await hashToken('5.6.7.8salt'));
    expect(args.rateLimit).toBe(5);
    expect(args.ref).toMatch(/^CD-[A-Z0-9]{6}$/);
    expect(args).toMatchObject({ lotSlug: 'lot-1', qty: 2 });
    expect(JSON.stringify(args)).not.toContain(body.orderToken);
  });

  it('honeypot: success-looking 201, no order, no payment data', async () => {
    const { post, db, storage } = setup();
    const res = await post({ ...validBody, website: 'http://spam' });
    expect(res.status).toBe(201);
    const text = await res.text();
    for (const real of [NUMBER, 'PLACEHOLDER HOLDER', 'qr.example', 'order-uuid', 'up.example']) {
      expect(text).not.toContain(real);
    }
    expect(db.reserveOrder).not.toHaveBeenCalled();
    expect(storage.createSignedUpload).not.toHaveBeenCalled();
  });

  it('400 on invalid input without touching the RPC', async () => {
    const { post, db } = setup();
    const res = await post({ ...validBody, consent: false });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
    expect(db.reserveOrder).not.toHaveBeenCalled();
  });

  it('400 when qty exceeds the lot max per order', async () => {
    const { post, db } = setup();
    expect((await post({ ...validBody, qty: 7 })).status).toBe(400);
    expect(db.reserveOrder).not.toHaveBeenCalled();
  });

  it('400 on malformed JSON, 405 on wrong method, 204 preflight', async () => {
    const { post, handler } = setup();
    expect((await post(undefined, {}, '{nope')).status).toBe(400);
    const get = await handler(new Request('https://fn.example/x', { headers: { origin: ORIGIN } }));
    expect(get.status).toBe(405);
    const pre = await handler(
      new Request('https://fn.example/x', { method: 'OPTIONS', headers: { origin: ORIGIN } }),
    );
    expect(pre.status).toBe(204);
  });

  it('413 for oversized bodies (declared or actual) before parsing', async () => {
    const { post, db } = setup();
    const declared = await post(undefined, { 'content-length': '999999' });
    expect(declared.status).toBe(413);
    const actual = await post(undefined, {}, JSON.stringify({ pad: 'x'.repeat(20000) }));
    expect(actual.status).toBe(413);
    expect(declared.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(db.getLotWithAvailability).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, -1, 2.5, '5', Number.NaN])(
    '500 and no RPC for invalid rate limit %s',
    async (rateLimit) => {
      const { post, db } = setup({ rateLimit });
      expect((await post()).status).toBe(500);
      expect(db.reserveOrder).not.toHaveBeenCalled();
    },
  );

  it('500 for missing ip salt or invalid lot max_per_order (config errors)', async () => {
    const a = setup({ ipSalt: '' });
    expect((await a.post()).status).toBe(500);
    const b = setup();
    b.db.getLotWithAvailability.mockResolvedValue({ ...lotRow, max_per_order: 0 });
    expect((await b.post()).status).toBe(500);
    expect(b.db.reserveOrder).not.toHaveBeenCalled();
  });

  it('404 for unknown or inactive lot', async () => {
    const { post, db } = setup();
    db.getLotWithAvailability.mockResolvedValueOnce(null);
    expect((await post()).status).toBe(404);
    db.getLotWithAvailability.mockResolvedValueOnce({ ...lotRow, active: false });
    expect((await post()).status).toBe(404);
  });

  it.each([
    ['OUT_OF_STOCK', 409],
    ['RATE_LIMITED', 429],
    ['LOT_UNAVAILABLE', 404],
    ['weird', 500],
  ])('maps RPC error %s to %i', async (message, status) => {
    const { post, db } = setup();
    db.reserveOrder.mockResolvedValue({ data: null, error: { message } });
    const res = await post();
    expect(res.status).toBe(status);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('retries with a new ref on ref unique-violation, then succeeds', async () => {
    const { post, db } = setup();
    db.reserveOrder
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'orders_ref_key' } })
      .mockResolvedValueOnce({ data: orderRow, error: null });
    expect((await post()).status).toBe(201);
    expect(db.reserveOrder).toHaveBeenCalledTimes(2);
    const [a, b] = db.reserveOrder.mock.calls.map((c) => c[0].ref);
    expect(a).not.toBe(b);
  });

  it('gives up with 500 after bounded ref retries', async () => {
    const { post, db } = setup();
    db.reserveOrder.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'orders_ref_key' },
    });
    expect((await post()).status).toBe(500);
    expect(db.reserveOrder.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('does not retry unique violations on other constraints', async () => {
    const { post, db } = setup();
    db.reserveOrder.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'orders_token_key' },
    });
    expect((await post()).status).toBe(500);
    expect(db.reserveOrder).toHaveBeenCalledTimes(1);
  });

  it('500 when signed upload creation fails', async () => {
    const { post, storage } = setup();
    storage.createSignedUpload.mockRejectedValue(new Error('storage down'));
    expect((await post()).status).toBe(500);
  });

  it('500 when signed upload fails after reserve: releases the hold without leaking', async () => {
    const { post, storage, db } = setup();
    storage.createSignedUpload.mockRejectedValue(new Error('storage down secret-detail'));
    const res = await post();
    expect(res.status).toBe(500);
    expect(db.releaseOrder).toHaveBeenCalledTimes(1);
    expect(db.releaseOrder).toHaveBeenCalledWith('order-uuid');
    const text = await res.text();
    expect(text).not.toMatch(/secret-detail|order-uuid|CD-AAAAAA|nequi/i);
  });

  it('still 500 when releasing the orphan order also fails', async () => {
    const { post, storage, db } = setup();
    storage.createSignedUpload.mockRejectedValue(new Error('storage down'));
    db.releaseOrder.mockRejectedValue(new Error('db down'));
    const res = await post();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL');
  });

  it('does not release anything when reserve itself fails', async () => {
    const { post, db } = setup();
    db.reserveOrder.mockResolvedValue({ data: null, error: { message: 'OUT_OF_STOCK' } });
    await post();
    expect(db.releaseOrder).not.toHaveBeenCalled();
  });

  it('409 OUT_OF_STOCK includes the current available count', async () => {
    const { post, db } = setup();
    db.reserveOrder.mockResolvedValue({ data: null, error: { message: 'OUT_OF_STOCK' } });
    const res = await post();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('OUT_OF_STOCK');
    expect(body.available).toBe(4);
  });

  it('409 clamps a non-finite or negative available to 0', async () => {
    const { post, db } = setup();
    db.getLotWithAvailability.mockResolvedValue({ ...lotRow, available: undefined });
    db.reserveOrder.mockResolvedValue({ data: null, error: { message: 'OUT_OF_STOCK' } });
    expect((await (await post()).json()).available).toBe(0);
  });
});

describe('createOrder client ip', () => {
  const ipHashFor = async (headers) => {
    const { post, db } = setup();
    await post(undefined, headers);
    return db.reserveOrder.mock.calls[0][0].ipHash;
  };

  it('spoofed leftmost x-forwarded-for does not change the bucket when cf-connecting-ip is set', async () => {
    const a = await ipHashFor({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' });
    const b = await ipHashFor({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '2.2.2.2' });
    expect(a).toBe(b);
    expect(a).toBe(await hashToken('9.9.9.9salt'));
  });

  it('uses the rightmost x-forwarded-for entry otherwise', async () => {
    const a = await ipHashFor({ 'x-forwarded-for': '1.1.1.1, 7.7.7.7' });
    const b = await ipHashFor({ 'x-forwarded-for': '2.2.2.2, 7.7.7.7' });
    expect(a).toBe(b);
    expect(a).toBe(await hashToken('7.7.7.7salt'));
  });

  it('garbage or missing headers map to the unknown bucket', async () => {
    const expected = await hashToken('unknownsalt');
    expect(await ipHashFor({ 'x-forwarded-for': 'not an ip' })).toBe(expected);
    const { db, handler } = setup();
    await handler(
      new Request('https://fn.example/create-order', {
        method: 'POST',
        headers: { origin: ORIGIN },
        body: JSON.stringify(validBody),
      }),
    );
    expect(db.reserveOrder.mock.calls[0][0].ipHash).toBe(expected);
  });

  it('the resolver is injectable', async () => {
    const resolveClientIp = vi.fn().mockReturnValue('4.4.4.4');
    const { post, db } = setup({}, { resolveClientIp });
    await post();
    expect(resolveClientIp).toHaveBeenCalled();
    expect(db.reserveOrder.mock.calls[0][0].ipHash).toBe(await hashToken('4.4.4.4salt'));
  });
});

const keysOf = (node, prefix = '') =>
  Object.entries(node).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

describe('createOrder honeypot shape parity', () => {
  const honey = { ...validBody, website: 'http://spam' };

  it('mirrors the real 201 keys (top-level and nested), status and content-type', async () => {
    const { post } = setup();
    const real = await post();
    const fake = await post(honey);
    expect(fake.status).toBe(real.status);
    expect(fake.headers.get('content-type')).toBe(real.headers.get('content-type'));
    expect(fake.headers.get('cache-control')).toBe(real.headers.get('cache-control'));
    expect(keysOf(await fake.json()).sort()).toEqual(keysOf(await real.json()).sort());
  });

  it('has plausible values: CD- ref, token, qty x price total, lot hold, fake upload', async () => {
    const { post } = setup();
    const before = Date.now();
    const body = await (await post(honey)).json();
    expect(body.ref).toMatch(/^CD-[A-Z0-9]{6}$/);
    expect(body.orderToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.total).toBe(2 * lotRow.price_cop);
    const hold = new Date(body.expiresAt).getTime() - before;
    expect(Math.abs(hold - lotRow.hold_minutes * 60000)).toBeLessThan(5000);
    expect(body.upload.signedUrl).toMatch(/^https:\/\//);
    expect(body.upload.path).toMatch(/\/receipt$/);
  });

  it('never exposes real lot data or storage and creates nothing', async () => {
    const { post, db, storage } = setup();
    const text = await (await post(honey)).text();
    for (const real of [NUMBER, 'PLACEHOLDER HOLDER', 'qr.example', 'up.example']) {
      expect(text).not.toContain(real);
    }
    expect(db.reserveOrder).not.toHaveBeenCalled();
    expect(storage.createSignedUpload).not.toHaveBeenCalled();
  });

  it('falls back to plausible values when the lot is unknown or the lookup fails', async () => {
    const { post, db } = setup();
    db.getLotWithAvailability.mockResolvedValueOnce(null);
    const a = await post(honey);
    expect(a.status).toBe(201);
    expect(typeof (await a.json()).total).toBe('number');
    db.getLotWithAvailability.mockRejectedValueOnce(new Error('down'));
    const b = await post(honey);
    expect(b.status).toBe(201);
    expect(keysOf(await b.json()).length).toBeGreaterThan(5);
  });

  it('still returns the fake 201 when the rest of the body is invalid or odd', async () => {
    const { post, db } = setup();
    for (const body of [
      { website: 'x' },
      { website: 'x', qty: 'many', customer: null, lotSlug: 42 },
      { website: 123, qty: 9999 },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(201);
      expect(Object.keys(await res.json()).sort()).toEqual(
        ['expiresAt', 'orderToken', 'payment', 'ref', 'total', 'upload'].sort(),
      );
    }
    expect(db.reserveOrder).not.toHaveBeenCalled();
  });
});

describe('createOrder response hygiene and extra cases', () => {
  it('sets Cache-Control: no-store on the 201 and the honeypot 201', async () => {
    const { post } = setup();
    expect((await post()).headers.get('cache-control')).toBe('no-store');
    expect((await post({ ...validBody, website: 'x' })).headers.get('cache-control')).toBe(
      'no-store',
    );
  });

  it('429 carries Retry-After (default 3600, configurable)', async () => {
    const a = setup();
    a.db.reserveOrder.mockResolvedValue({ data: null, error: { message: 'RATE_LIMITED' } });
    expect((await a.post()).headers.get('retry-after')).toBe('3600');
    const b = setup({ retryAfterSeconds: 120 });
    b.db.reserveOrder.mockResolvedValue({ data: null, error: { message: 'RATE_LIMITED' } });
    expect((await b.post()).headers.get('retry-after')).toBe('120');
  });

  it('400 when qty exceeds the pass-1 ceiling of 100, before any lot lookup', async () => {
    const { post, db } = setup();
    const res = await post({ ...validBody, qty: 101 });
    expect(res.status).toBe(400);
    expect(db.getLotWithAvailability).not.toHaveBeenCalled();
  });

  it.each([
    ['array', '[]'],
    ['null', 'null'],
    ['number', '42'],
    ['string', '"hi"'],
  ])('400 for a %s body', async (_n, raw) => {
    const { post, db } = setup();
    const res = await post(undefined, {}, raw);
    expect(res.status).toBe(400);
    expect(db.reserveOrder).not.toHaveBeenCalled();
  });

  it('413 when content-length lies small but the stream is large', async () => {
    const { post, db } = setup();
    const res = await post(
      undefined,
      { 'content-length': '10' },
      JSON.stringify({ p: 'x'.repeat(20000) }),
    );
    expect(res.status).toBe(413);
    expect(db.getLotWithAvailability).not.toHaveBeenCalled();
  });

  it('201 contains only the intended secrets (no hashes, ip, salt or internal ids)', async () => {
    const { post, db } = setup();
    const res = await post();
    const text = await res.text();
    const body = JSON.parse(text);
    const { tokenHash, ipHash } = db.reserveOrder.mock.calls[0][0];
    for (const hidden of [tokenHash, ipHash, 'salt', '5.6.7.8', 'order-uuid"', 'hold_minutes']) {
      expect(text).not.toContain(hidden);
    }
    expect(Object.keys(body).sort()).toEqual(
      ['expiresAt', 'orderToken', 'payment', 'ref', 'total', 'upload'].sort(),
    );
    expect(Object.keys(body.payment).sort()).toEqual(
      ['holder', 'nequiNumber', 'qrUrl', 'whatsapp'].sort(),
    );
  });
});
