// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { corsHeaders, handlePreflight } from './cors.js';
import { mapRpcError } from './errors.js';
import { errorResponse, jsonResponse } from './http.js';
import { generateReference, REF_ALPHABET } from './reference.js';
import { generateToken, hashToken } from './tokens.js';
import { canTransition, isExpired } from './transitions.js';

describe('reference', () => {
  it('generates CD- + 6 chars from the strict alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const ref = generateReference();
      expect(ref).toMatch(/^CD-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    }
    expect(REF_ALPHABET).not.toMatch(/[01OIL]/);
  });
  it('is injectable for determinism', () => {
    expect(generateReference(() => new Uint8Array([0, 1, 2, 3, 4, 5]))).toBe('CD-234567');
  });
});

describe('tokens', () => {
  it('generates distinct base64url tokens of 32 bytes', () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });
  it('hashes to sha256 hex deterministically', async () => {
    expect(await hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('mapRpcError', () => {
  it.each([
    ['LOT_UNAVAILABLE', 404, 'LOT_UNAVAILABLE'],
    ['INVALID_QTY', 400, 'INVALID_INPUT'],
    ['RATE_LIMITED', 429, 'RATE_LIMITED'],
    ['OUT_OF_STOCK', 409, 'OUT_OF_STOCK'],
    ['INVALID_RATE_LIMIT', 500, 'INTERNAL'],
  ])('%s -> %i', (message, status, code) => {
    expect(mapRpcError({ message })).toEqual({ status, code });
  });
  it('maps unknown and raw constraint errors to INTERNAL 500', () => {
    expect(mapRpcError({ code: '23514', message: 'violates check' })).toEqual({
      status: 500,
      code: 'INTERNAL',
    });
    expect(mapRpcError(null)).toEqual({ status: 500, code: 'INTERNAL' });
  });
});

describe('http', () => {
  it('jsonResponse sets status and JSON body', async () => {
    const r = jsonResponse({ a: 1 }, 201, { 'x-test': '1' });
    expect(r.status).toBe(201);
    expect(r.headers.get('content-type')).toContain('application/json');
    expect(r.headers.get('x-test')).toBe('1');
    expect(await r.json()).toEqual({ a: 1 });
  });
  it('errorResponse uses the {error:{code,message}} envelope', async () => {
    const r = errorResponse(409, 'OUT_OF_STOCK', 'Sin stock', {}, { available: 1 });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      error: { code: 'OUT_OF_STOCK', message: 'Sin stock' },
      available: 1,
    });
  });
});

describe('cors', () => {
  const allowed = ['https://colibri.test'];
  it('echoes only allow-listed origins', () => {
    expect(corsHeaders('https://colibri.test', allowed)['access-control-allow-origin']).toBe(
      'https://colibri.test',
    );
    expect(
      corsHeaders('https://evil.test', allowed)['access-control-allow-origin'],
    ).toBeUndefined();
    expect(corsHeaders(null, allowed)['access-control-allow-origin']).toBeUndefined();
  });
  it('answers preflight with allowed headers, 403 for unknown origin', () => {
    const ok = handlePreflight(
      new Request('https://f', { method: 'OPTIONS', headers: { origin: 'https://colibri.test' } }),
      allowed,
    );
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-headers')).toBe(
      'authorization, x-client-info, apikey, content-type',
    );
    const bad = handlePreflight(
      new Request('https://f', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }),
      allowed,
    );
    expect(bad.status).toBe(403);
  });
  it('returns null for non-OPTIONS requests', () => {
    expect(handlePreflight(new Request('https://f'), allowed)).toBeNull();
  });
});

describe('transitions', () => {
  it('allows only the defined transitions', () => {
    expect(canTransition('pending_payment', 'pending_verification')).toBe(true);
    expect(canTransition('pending_verification', 'confirmed')).toBe(true);
    expect(canTransition('pending_verification', 'rejected')).toBe(true);
    expect(canTransition('pending_payment', 'confirmed')).toBe(false);
    expect(canTransition('rejected', 'confirmed')).toBe(false);
    expect(canTransition('confirmed', 'rejected')).toBe(false);
  });
  it('fails closed on prototype keys instead of throwing', () => {
    for (const from of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(canTransition(from, 'confirmed')).toBe(false);
    }
  });
  it('isExpired only applies to pending_payment past the hold window', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const old = '2026-01-01T09:59:00Z';
    expect(isExpired({ status: 'pending_payment', created_at: old }, 120, now)).toBe(true);
    expect(
      isExpired({ status: 'pending_payment', created_at: '2026-01-01T10:30:00Z' }, 120, now),
    ).toBe(false);
    expect(isExpired({ status: 'pending_verification', created_at: old }, 120, now)).toBe(false);
    expect(isExpired({ status: 'expired', created_at: '2026-01-01T11:59:00Z' }, 120, now)).toBe(
      true,
    );
  });
});
