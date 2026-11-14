import { describe, expect, it } from 'vitest';
import { safeHttpsUrl, safeWhatsappUrl } from '../domains/orders/domain/paymentLinks';

describe('safeHttpsUrl', () => {
  it('keeps https urls', () => {
    expect(safeHttpsUrl('https://cdn.test/qr.png')).toBe('https://cdn.test/qr.png');
  });

  it.each([
    'javascript:alert(1)',
    'http://cdn.test/qr.png',
    'data:image/png;base64,AAAA',
    '//cdn.test/qr.png',
    'not a url',
    '',
    null,
    undefined,
    42,
  ])('omits %s', (value) => {
    expect(safeHttpsUrl(value)).toBeNull();
  });
});

describe('safeWhatsappUrl', () => {
  it('keeps https://wa.me links', () => {
    expect(safeWhatsappUrl('https://wa.me/573000000000')).toBe('https://wa.me/573000000000');
  });

  it.each([
    'https://evil.test/573000000000',
    'https://wa.me.evil.test/573000000000',
    'https://evil.test/wa.me/1',
    'http://wa.me/573000000000',
    'javascript:alert(1)',
    undefined,
  ])('omits %s', (value) => {
    expect(safeWhatsappUrl(value)).toBeNull();
  });
});
