// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { REASON_MAX } from './constants.js';
import { cleanReason, parseCode, parseCommand, parseInteger } from './parse.js';

describe('parseCommand', () => {
  it('lowercases the command and strips @botname (S1.7)', () => {
    expect(parseCommand('/LOTES@MyBot')).toEqual({ name: 'lotes', args: {} });
    expect(parseCommand('  /ayuda  extra')).toEqual({ name: 'ayuda', args: {} });
  });

  it('parses /pedido ref in upper case', () => {
    expect(parseCommand('/pedido cd-abc234')).toEqual({
      name: 'pedido',
      args: { ref: 'CD-ABC234' },
    });
  });

  it.each(['/pedido', '/pedido nope', '/pedido CD-ABC23', '/pedido CD-ABC234 x'])(
    'gives the usage line for invalid args: %s (R1.7)',
    (text) => {
      expect(parseCommand(text)).toEqual({ name: 'pedido', usage: '/pedido <ref>' });
    },
  );

  it.each(['/foo', 'hola', '', undefined, '/', '/@bot'])('hints for %j (S1.14)', (text) => {
    expect(parseCommand(text)).toEqual({ hint: true });
  });
});

describe('field helpers (used by later slices)', () => {
  it('normalizes lot codes (S1.8)', () => {
    expect(parseCode('M500')).toBe('m500');
    expect(parseCode('m')).toBeNull();
    expect(parseCode('abcdefghi')).toBeNull();
    expect(parseCode('a-b')).toBeNull();
  });

  it('accepts strict integers only', () => {
    expect(parseInteger('5')).toBe(5);
    expect(parseInteger('-3', { signed: true })).toBe(-3);
    expect(parseInteger('+3', { signed: true })).toBe(3);
    for (const bad of ['5.5', '1e3', '٥', '1,000', '', '0', '007']) {
      expect(parseInteger(bad, { signed: true })).toBeNull();
    }
    expect(parseInteger('-3')).toBeNull();
  });

  it('collapses the reason and caps its length', () => {
    expect(cleanReason(['a', '  b\n c '])).toBe('a b c');
    expect(cleanReason(['x'.repeat(REASON_MAX + 1)])).toBeNull();
    expect(cleanReason([])).toBe('');
  });
});
