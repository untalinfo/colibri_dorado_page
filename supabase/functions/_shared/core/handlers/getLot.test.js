// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createGetLotHandler } from './getLot.js';

const ORIGIN = 'https://shop.example';
const SECRET_NUMBER = '3000000000';
const SECRET_HOLDER = 'PLACEHOLDER HOLDER';
const SECRET_QR = 'https://qr.example/secret.png';

const lotRow = {
  slug: 'lot-1',
  name: 'Lot One',
  price_cop: 50000,
  max_per_order: 6,
  hold_minutes: 120,
  active: true,
  available: 4,
  nequi_number: SECRET_NUMBER,
  nequi_holder: SECRET_HOLDER,
  nequi_qr_url: SECRET_QR,
};

const setup = (row = lotRow) => {
  const db = { getLotWithAvailability: vi.fn().mockResolvedValue(row) };
  const handler = createGetLotHandler({ db, config: { allowedOrigins: [ORIGIN] } });
  const call = (url = 'https://fn.example/get-lot?slug=lot-1', init = {}) =>
    handler(new Request(url, { headers: { origin: ORIGIN }, ...init }));
  return { db, call };
};

const walk = (node, seen = []) => {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      seen.push(k, v);
      walk(v, seen);
    }
  } else seen.push(node);
  return seen;
};

describe('getLot handler', () => {
  it('returns only public lot data', async () => {
    const { call } = setup();
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      lot: {
        slug: 'lot-1',
        name: 'Lot One',
        priceCop: 50000,
        available: 4,
        maxPerOrder: 6,
        active: true,
      },
    });
  });

  it('never leaks payment or contact data (deep scan of keys and values)', async () => {
    const { call } = setup();
    const body = await (await call()).json();
    const flat = walk(body).map(String).join('|').toLowerCase();
    for (const bad of ['nequi', 'phone', 'holder', 'qr', 'number', 'whatsapp']) {
      expect(flat).not.toContain(bad);
    }
    for (const secret of [SECRET_NUMBER, SECRET_HOLDER, SECRET_QR]) {
      expect(flat).not.toContain(secret.toLowerCase());
    }
  });

  it('clamps negative availability to 0', async () => {
    const { call } = setup({ ...lotRow, available: -2 });
    expect((await (await call()).json()).lot.available).toBe(0);
  });

  it.each([undefined, null, Number.NaN, 'x'])('non-finite available %s becomes 0', async (v) => {
    const { call } = setup({ ...lotRow, available: v });
    expect((await (await call()).json()).lot.available).toBe(0);
  });

  it('400 without slug, 404 for unknown or inactive lot', async () => {
    const { call, db } = setup();
    expect((await call('https://fn.example/get-lot')).status).toBe(400);
    db.getLotWithAvailability.mockResolvedValueOnce(null);
    const missing = await call();
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('LOT_UNAVAILABLE');
    db.getLotWithAvailability.mockResolvedValueOnce({ ...lotRow, active: false });
    expect((await call()).status).toBe(404);
  });

  it('405 for non-GET, 204 preflight, 500 when db throws', async () => {
    const { call, db } = setup();
    expect((await call(undefined, { method: 'POST' })).status).toBe(405);
    expect((await call(undefined, { method: 'OPTIONS' })).status).toBe(204);
    db.getLotWithAvailability.mockRejectedValueOnce(new Error('boom'));
    const res = await call();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL');
  });

  it('applies CORS to success and error responses', async () => {
    const { call } = setup();
    expect((await call()).headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(
      (await call('https://fn.example/get-lot')).headers.get('access-control-allow-origin'),
    ).toBe(ORIGIN);
  });
});
