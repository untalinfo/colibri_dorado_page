// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { adjustStockResult } from './stock.js';

describe('adjustStockResult', () => {
  it('passes the RPC result through', () => {
    const data = { stock: 34, available: 30, replayed: false };
    expect(adjustStockResult({ data, error: null })).toBe(data);
  });

  it('maps known error codes, reading available units from details', () => {
    expect(adjustStockResult({ error: { message: 'BELOW_HELD', details: '4' } })).toEqual({
      error: 'BELOW_HELD',
      available: 4,
    });
    for (const code of ['INVALID_ARGS', 'LOT_NOT_FOUND']) {
      expect(adjustStockResult({ error: { message: code } }).error).toBe(code);
    }
  });

  it('rethrows unknown failures', () => {
    const error = new Error('connection reset');
    expect(() => adjustStockResult({ error })).toThrow(error);
  });
});
