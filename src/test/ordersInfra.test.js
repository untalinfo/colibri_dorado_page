import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPendingOrderStore } from '../domains/orders/infrastructure/pendingOrderStore';
import { createSupabaseOrdersRepository } from '../domains/orders/infrastructure/supabaseOrdersRepository';
import { ApiError, getReservationsConfig } from '../shared/lib/supabase';

const config = { url: 'https://x.supabase.co', anonKey: 'anon-key' };
const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('getReservationsConfig', () => {
  it('returns null when disabled or incomplete', () => {
    expect(getReservationsConfig({})).toBeNull();
    expect(
      getReservationsConfig({ VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'k' }),
    ).toBeNull();
    expect(
      getReservationsConfig({ VITE_RESERVATIONS_ENABLED: 'true', VITE_SUPABASE_URL: 'u' }),
    ).toBeNull();
  });

  it('returns config when enabled and complete', () => {
    expect(
      getReservationsConfig({
        VITE_RESERVATIONS_ENABLED: 'true',
        VITE_SUPABASE_URL: 'https://x.supabase.co/',
        VITE_SUPABASE_ANON_KEY: 'k',
      }),
    ).toEqual({ url: 'https://x.supabase.co', anonKey: 'k' });
  });
});

describe('supabaseOrdersRepository', () => {
  it('fetchLot GETs get-lot with anon headers and unwraps the lot', async () => {
    const fetchImpl = vi.fn(async () => reply(200, { lot: { slug: 's', available: 4 } }));
    const repo = createSupabaseOrdersRepository(config, fetchImpl);
    await expect(repo.fetchLot('s')).resolves.toEqual({ slug: 's', available: 4 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://x.supabase.co/functions/v1/get-lot?slug=s');
    expect(init.headers.apikey).toBe('anon-key');
    expect(init.headers.Authorization).toBe('Bearer anon-key');
  });

  it('throws a coded error on non-2xx', async () => {
    const fetchImpl = vi.fn(async () =>
      reply(404, { error: { code: 'LOT_UNAVAILABLE', message: 'no' } }),
    );
    const repo = createSupabaseOrdersRepository(config, fetchImpl);
    await expect(repo.fetchLot('s')).rejects.toMatchObject({
      code: 'LOT_UNAVAILABLE',
      status: 404,
    });
  });

  it('createOrder, submitReceipt and renewUpload POST JSON to their functions', async () => {
    const fetchImpl = vi.fn(async () => reply(200, { ok: true }));
    const repo = createSupabaseOrdersRepository(config, fetchImpl);
    await repo.createOrder({ lotSlug: 's' });
    await repo.submitReceipt({ ref: 'CD-AAAAAA', orderToken: 't' });
    await repo.renewUpload({ ref: 'CD-AAAAAA', orderToken: 't' });
    const calls = fetchImpl.mock.calls.map(([u, i]) => [u, i.method, JSON.parse(i.body)]);
    expect(calls[0]).toEqual([`${config.url}/functions/v1/create-order`, 'POST', { lotSlug: 's' }]);
    expect(calls[1][0]).toBe(`${config.url}/functions/v1/submit-receipt`);
    expect(calls[1][2]).toEqual({ ref: 'CD-AAAAAA', orderToken: 't', action: 'submit' });
    expect(calls[2][2].action).toBe('renew');
  });

  it('uploadReceipt PUTs the file to the signed url', async () => {
    const fetchImpl = vi.fn(async () => reply(200, {}));
    const repo = createSupabaseOrdersRepository(config, fetchImpl);
    const blob = new Blob(['x'], { type: 'image/png' });
    await repo.uploadReceipt('https://signed.example/up?token=t', blob);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://signed.example/up?token=t');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(blob);
    expect(init.headers['Content-Type']).toBe('image/png');
  });

  it('uploadReceipt fails when storage rejects', async () => {
    const repo = createSupabaseOrdersRepository(
      config,
      vi.fn(async () => reply(400, {})),
    );
    await expect(repo.uploadReceipt('https://s/u', new Blob(['x']))).rejects.toMatchObject({
      code: 'UPLOAD_FAILED',
    });
  });
});

const hangingFetch = () =>
  vi.fn(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      }),
  );

describe('request timeouts', () => {
  afterEach(() => vi.useRealTimers());

  it('API calls abort after the timeout and surface ApiError TIMEOUT', async () => {
    vi.useFakeTimers();
    const fetchImpl = hangingFetch();
    const repo = createSupabaseOrdersRepository(config, fetchImpl);
    const result = repo.fetchLot('s').catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const err = await result;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'TIMEOUT' });
    expect(err.message).toBe('TIMEOUT');
  });

  it('API calls do not time out before the limit', async () => {
    vi.useFakeTimers();
    const repo = createSupabaseOrdersRepository(config, hangingFetch());
    let settled = false;
    repo.fetchLot('s').then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
  });

  it('uploads use a longer 60s timeout and surface TIMEOUT', async () => {
    vi.useFakeTimers();
    const repo = createSupabaseOrdersRepository(config, hangingFetch());
    const result = repo.uploadReceipt('https://s/u', new Blob(['x'])).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    let settled = false;
    result.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(await result).toMatchObject({ code: 'TIMEOUT' });
  });

  it('accepts injected timeouts', async () => {
    const repo = createSupabaseOrdersRepository(config, hangingFetch(), {
      timeoutMs: 5,
      uploadTimeoutMs: 5,
    });
    await expect(repo.createOrder({ lotSlug: 's' })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(repo.uploadReceipt('https://s/u', new Blob(['x']))).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('non-abort network errors are not relabelled as TIMEOUT', async () => {
    const repo = createSupabaseOrdersRepository(
      config,
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(repo.fetchLot('s')).rejects.toBeInstanceOf(TypeError);
  });
});

describe('fetchLot response validation', () => {
  it('rejects a 200 without a lot', async () => {
    const repo = createSupabaseOrdersRepository(
      config,
      vi.fn(async () => reply(200, {})),
    );
    await expect(repo.fetchLot('s')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('pendingOrderStore', () => {
  beforeEach(() => localStorage.clear());

  it('persists only ref, orderToken and expiresAt', () => {
    const store = createPendingOrderStore(localStorage);
    store.save({
      ref: 'CD-AAAAAA',
      orderToken: 'tok',
      expiresAt: '2999-01-01T00:00:00.000Z',
      payment: { nequiNumber: 'SECRET' },
      upload: { signedUrl: 'u' },
    });
    const raw = localStorage.getItem('colibri.pendingOrder');
    expect(JSON.parse(raw)).toEqual({
      ref: 'CD-AAAAAA',
      orderToken: 'tok',
      expiresAt: '2999-01-01T00:00:00.000Z',
    });
    expect(raw).not.toMatch(/SECRET|nequi|signedUrl/i);
  });

  it('loads a valid order, clears expired or corrupt data', () => {
    const store = createPendingOrderStore(localStorage);
    store.save({ ref: 'CD-AAAAAA', orderToken: 't', expiresAt: '2999-01-01T00:00:00.000Z' });
    expect(store.load()?.ref).toBe('CD-AAAAAA');

    store.save({ ref: 'CD-AAAAAA', orderToken: 't', expiresAt: '2000-01-01T00:00:00.000Z' });
    expect(store.load()).toBeNull();
    expect(localStorage.getItem('colibri.pendingOrder')).toBeNull();

    localStorage.setItem('colibri.pendingOrder', '{not json');
    expect(store.load()).toBeNull();
  });

  it('clear removes the entry and storage errors never throw', () => {
    const store = createPendingOrderStore(localStorage);
    store.save({ ref: 'CD-AAAAAA', orderToken: 't', expiresAt: '2999-01-01T00:00:00.000Z' });
    store.clear();
    expect(localStorage.getItem('colibri.pendingOrder')).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const safe = createPendingOrderStore(broken);
    expect(() => safe.save({ ref: 'a', orderToken: 'b', expiresAt: 'c' })).not.toThrow();
    expect(safe.load()).toBeNull();
    expect(() => safe.clear()).not.toThrow();
  });

  it('is a no-op store when resolving localStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      let store;
      expect(() => {
        store = createPendingOrderStore();
      }).not.toThrow();
      expect(() => store.save({ ref: 'a', orderToken: 'b', expiresAt: 'c' })).not.toThrow();
      expect(store.load()).toBeNull();
      expect(() => store.clear()).not.toThrow();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete globalThis.localStorage;
    }
  });
});
