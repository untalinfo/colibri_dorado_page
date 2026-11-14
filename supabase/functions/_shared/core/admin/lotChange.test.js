// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { changeLotResult, summaryRows } from './lotChange.js';

describe('changeLotResult', () => {
  it('passes the RPC result through', () => {
    const data = { changed: true, old: 1, new: 0, replayed: false };
    expect(changeLotResult({ data, error: null })).toBe(data);
  });

  it('maps known error codes', () => {
    for (const code of ['INVALID_ARGS', 'LOT_NOT_FOUND']) {
      expect(changeLotResult({ error: { message: code } })).toEqual({ error: code });
    }
  });

  it('rethrows unknown failures', () => {
    const error = new Error('connection reset');
    expect(() => changeLotResult({ error })).toThrow(error);
  });
});

describe('summaryRows', () => {
  it('coerces bigint revenue to numbers and rethrows RPC errors', () => {
    const rows = summaryRows({
      data: [{ status: 'confirmed', orders: 2, units: 3, revenue_cop: '76000' }],
      error: null,
    });
    expect(rows[0].revenue_cop).toBe(76000);
    expect(() => summaryRows({ error: new Error('boom') })).toThrow('boom');
  });
});
