import { describe, expect, it } from 'vitest';
import { formatCOP } from '../domains/orders/domain/money';
import { validateOrderInput } from '../domains/orders/domain/orderRules';
import { MAX_RECEIPT_BYTES, validateReceiptFile } from '../domains/orders/domain/receiptFile';

describe('formatCOP', () => {
  it('formats with dot thousands separators', () => {
    expect(formatCOP(38000)).toBe('$38.000');
    expect(formatCOP(1234567)).toBe('$1.234.567');
    expect(formatCOP(0)).toBe('$0');
  });
});

describe('validateReceiptFile', () => {
  const file = (type, size) => ({ type, size });

  it('accepts images and pdf within 5MB', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
      expect(validateReceiptFile(file(t, 1000))).toEqual({ ok: true });
    }
  });

  it('rejects other types, empty and oversize files', () => {
    expect(validateReceiptFile(file('text/html', 10))).toEqual({ ok: false, error: 'type' });
    expect(validateReceiptFile(file('image/png', 0))).toEqual({ ok: false, error: 'empty' });
    expect(validateReceiptFile(file('image/png', MAX_RECEIPT_BYTES + 1))).toEqual({
      ok: false,
      error: 'size',
    });
    expect(validateReceiptFile(null)).toEqual({ ok: false, error: 'empty' });
  });
});

describe('orderRules re-export', () => {
  it('shares the backend validation', () => {
    const res = validateOrderInput(
      {
        lotSlug: 'x',
        qty: 99,
        customer: { name: 'Ana', phone: '3001234567', address: 'Calle 1' },
        consent: true,
      },
      6,
    );
    expect(res.ok).toBe(false);
    expect(res.errors.qty).toBe('range');
  });
});
