// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MSG_LIMIT } from './constants.js';
import { chunk, formatHelp, formatLots, formatOrder, formatPending, truncate } from './format.js';

const NOW = new Date('2026-11-14T15:00:00Z');

describe('chunk', () => {
  it('keeps short text as one chunk', () => {
    expect(chunk('hola')).toEqual(['hola']);
  });

  it('splits at line boundaries, each chunk under MSG_LIMIT (S1.10)', () => {
    const text = Array.from({ length: 20 }, (_, i) => `${i}:${'x'.repeat(248)}`).join('\n');
    const parts = chunk(text);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    for (const p of parts) expect(p.length).toBeLessThan(MSG_LIMIT);
    expect(parts.join('\n')).toBe(text);
    for (const p of parts) expect(p.startsWith('\n') || p.endsWith('\n')).toBe(false);
  });

  it('hard-splits a single oversized line', () => {
    const parts = chunk('y'.repeat(9000));
    expect(parts.length).toBe(3);
    for (const p of parts) expect(p.length).toBeLessThan(MSG_LIMIT);
    expect(parts.join('')).toBe('y'.repeat(9000));
  });
});

describe('truncate', () => {
  it('cuts to the limit with an ellipsis and flattens whitespace (S1.11)', () => {
    expect(truncate('a'.repeat(3000), 60)).toHaveLength(60);
    expect(truncate('a\n b', 60)).toBe('a b');
    expect(truncate('ok', 60)).toBe('ok');
  });
});

const lot = (i) => ({
  code: `l${i}`,
  name: `Lote ${i}`,
  price_cop: 38000,
  stock: 10,
  available: 7,
  active: i % 2 === 0,
});

describe('formatters', () => {
  it('/ayuda lists every command with usage', () => {
    const text = formatHelp();
    for (const c of ['/ayuda', '/lotes', '/pendientes', '/pedido <ref>']) {
      expect(text).toContain(c);
    }
  });

  it('/lotes caps at 20 rows and says how many are omitted (S1.9)', () => {
    const text = formatLots(Array.from({ length: 45 }, (_, i) => lot(i)));
    expect(text.split('\n').filter((l) => l.startsWith('l'))).toHaveLength(20);
    expect(text).toContain('y 25 más');
    expect(formatLots([lot(1)])).toContain('pausado');
    expect(formatLots([])).toBe('Sin lotes');
  });

  it('/pendientes says so when empty and renders age/name/total otherwise', () => {
    expect(formatPending([], NOW)).toBe('Sin pedidos pendientes');
    const text = formatPending(
      [
        {
          ref: 'CD-ABC234',
          customer_name: 'N'.repeat(500),
          total_cop: 76000,
          created_at: '2026-11-14T12:00:00Z',
        },
      ],
      NOW,
    );
    expect(text).toContain('CD-ABC234');
    expect(text).toContain('3 h');
    expect(text).not.toContain('N'.repeat(61));
  });

  it('/pedido keeps customer markup verbatim, truncated, with Bogota dates and no nequi (S1.12, S1.13)', () => {
    const text = formatOrder({
      ref: 'CD-ABC234',
      status: 'confirmed',
      qty: 2,
      total_cop: 76000,
      customer_name: '<b>x</b> *y*',
      customer_phone: '3001234567',
      customer_address: 'D'.repeat(3000),
      created_at: '2026-11-14T12:00:00Z',
      decided_at: '2026-11-14T15:00:00Z',
      decided_by_name: 'Carlos',
      lots: { code: 'm500' },
    });
    expect(text).toContain('<b>x</b> *y*');
    expect(text).toContain('m500');
    expect(text).toContain('Carlos');
    expect(text).toContain('10:00 14/11');
    expect(text.length).toBeLessThan(MSG_LIMIT);
    expect(text.toLowerCase()).not.toContain('nequi');
  });
});
