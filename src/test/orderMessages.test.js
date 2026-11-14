import { describe, expect, it } from 'vitest';
import { errorMessage, TERMINAL_CODES } from '../domains/orders/presentation/orderMessages';

describe('errorMessage', () => {
  it('says the receipt already arrived on INVALID_STATE and never claims expiry', () => {
    const text = errorMessage('INVALID_STATE');
    expect(text).toMatch(/Ya recibimos tu comprobante/);
    expect(text).toMatch(/te confirmaremos pronto/);
    expect(text).not.toMatch(/venci/i);
  });

  it('keeps INVALID_STATE out of the expiry-terminal codes', () => {
    expect(TERMINAL_CODES).toEqual(['HOLD_EXPIRED', 'NOT_FOUND']);
  });

  it('has dedicated copy for LOT_UNAVAILABLE', () => {
    expect(errorMessage('LOT_UNAVAILABLE')).toBe('Este lote no está disponible por ahora.');
  });

  it('tells the user to try again later when rate limited', () => {
    expect(errorMessage('RATE_LIMITED')).toMatch(/más tarde/);
  });
});
