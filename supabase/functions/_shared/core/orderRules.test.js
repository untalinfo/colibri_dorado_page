// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizePhone, validateOrderInput } from './orderRules.js';

const valid = {
  lotSlug: 'miel',
  qty: 2,
  customer: { name: 'Ana Perez', phone: '3001234567', address: 'Calle 1 #2-3, Medellin' },
  consent: true,
  website: '',
};

describe('normalizePhone', () => {
  it('strips +57, spaces and dashes', () => {
    expect(normalizePhone('+57 300 123 4567')).toBe('3001234567');
    expect(normalizePhone('300-123-4567')).toBe('3001234567');
    expect(normalizePhone('0057 3001234567')).toBe('3001234567');
  });
});

describe('validateOrderInput', () => {
  it('accepts a valid payload and returns normalized values', () => {
    const r = validateOrderInput(
      { ...valid, customer: { ...valid.customer, phone: '+57 300 123 4567' } },
      6,
    );
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({
      lotSlug: 'miel',
      qty: 2,
      customer: { phone: '3001234567' },
    });
  });

  it.each([0, -1, 1.5, 7, '2', null, undefined])('rejects qty %s', (qty) => {
    expect(validateOrderInput({ ...valid, qty }, 6).ok).toBe(false);
  });

  it.each(['', '  ', undefined])('rejects name %j', (name) => {
    expect(validateOrderInput({ ...valid, customer: { ...valid.customer, name } }, 6).ok).toBe(
      false,
    );
  });

  it.each(['2001234567', '300123456', '30012345678', 'abc', ''])('rejects phone %j', (phone) => {
    expect(validateOrderInput({ ...valid, customer: { ...valid.customer, phone } }, 6).ok).toBe(
      false,
    );
  });

  it('rejects empty address', () => {
    expect(
      validateOrderInput({ ...valid, customer: { ...valid.customer, address: ' ' } }, 6).ok,
    ).toBe(false);
  });

  it.each([false, 'true', 1, undefined])('requires consent === true (%j)', (consent) => {
    expect(validateOrderInput({ ...valid, consent }, 6).ok).toBe(false);
  });

  it('email is optional but must look like an email when present', () => {
    expect(validateOrderInput({ ...valid, customer: { ...valid.customer, email: '' } }, 6).ok).toBe(
      true,
    );
    expect(
      validateOrderInput({ ...valid, customer: { ...valid.customer, email: 'a@b.co' } }, 6).ok,
    ).toBe(true);
    expect(
      validateOrderInput({ ...valid, customer: { ...valid.customer, email: 'nope' } }, 6).ok,
    ).toBe(false);
  });

  it('flags the honeypot without failing validation', () => {
    const r = validateOrderInput({ ...valid, website: 'http://spam' }, 6);
    expect(r).toEqual({ ok: true, honeypot: true });
  });

  it('rejects non-object bodies', () => {
    expect(validateOrderInput(null, 6).ok).toBe(false);
    expect(validateOrderInput('x', 6).ok).toBe(false);
  });
});

describe('validateOrderInput hardening', () => {
  it('reports honeypot false on a clean valid payload', () => {
    expect(validateOrderInput(valid, 6).honeypot).toBe(false);
  });

  it('checks the honeypot before validation so bots never see field errors', () => {
    expect(validateOrderInput({ website: 'x' }, 6)).toEqual({ ok: true, honeypot: true });
  });

  it('treats any non-empty honeypot value as a hit, not only strings', () => {
    for (const website of [123, true, {}, ['x']]) {
      expect(validateOrderInput({ ...valid, website }, 6)).toEqual({ ok: true, honeypot: true });
    }
  });

  it('fails closed when maxPerOrder is not a positive integer', () => {
    for (const max of [undefined, null, Number.NaN, 0, 2.5, '6']) {
      expect(() => validateOrderInput({ ...valid, qty: 999 }, max)).toThrow(
        'INVALID_MAX_PER_ORDER',
      );
    }
  });

  it('rejects fields over their length limits', () => {
    const r = validateOrderInput(
      {
        ...valid,
        lotSlug: 'x'.repeat(65),
        customer: {
          ...valid.customer,
          name: 'a'.repeat(101),
          address: 'b'.repeat(301),
          email: `${'c'.repeat(250)}@x.co`,
        },
      },
      6,
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toMatchObject({
      lotSlug: 'too_long',
      name: 'too_long',
      address: 'too_long',
      email: 'too_long',
    });
  });

  it('treats invisible-only text as empty', () => {
    const r = validateOrderInput(
      { ...valid, customer: { ...valid.customer, name: '\u200B\u2060', address: '\uFEFF \u200D' } },
      6,
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toMatchObject({ name: 'required', address: 'required' });
  });
});
