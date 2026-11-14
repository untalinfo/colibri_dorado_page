// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveClientIp } from './clientIp.js';

const h = (obj) => new Headers(obj);

describe('resolveClientIp', () => {
  it('prefers cf-connecting-ip over everything else', () => {
    const headers = h({
      'cf-connecting-ip': '9.9.9.9',
      'x-real-ip': '8.8.8.8',
      'x-forwarded-for': '1.1.1.1, 2.2.2.2',
    });
    expect(resolveClientIp(headers)).toBe('9.9.9.9');
  });

  it('a spoofed leftmost x-forwarded-for does not change the result when cf-connecting-ip exists', () => {
    const a = resolveClientIp(h({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }));
    const b = resolveClientIp(h({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '6.6.6.6' }));
    expect(a).toBe(b);
  });

  it('uses x-real-ip when cf-connecting-ip is absent', () => {
    expect(resolveClientIp(h({ 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '1.1.1.1' }))).toBe(
      '8.8.8.8',
    );
  });

  it('uses the rightmost x-forwarded-for entry otherwise', () => {
    expect(resolveClientIp(h({ 'x-forwarded-for': '6.6.6.6, 1.1.1.1 , 4.4.4.4' }))).toBe('4.4.4.4');
  });

  it('accepts IPv6', () => {
    expect(resolveClientIp(h({ 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('falls back to unknown without headers', () => {
    expect(resolveClientIp(h({}))).toBe('unknown');
  });

  it.each(['garbage', '999.1.1.1', '1.2.3', '<script>', 'a'.repeat(300), '1.2.3.4 ; drop'])(
    'garbage value %s becomes unknown',
    (bad) => {
      expect(resolveClientIp(h({ 'cf-connecting-ip': bad }))).toBe('unknown');
      expect(resolveClientIp(h({ 'x-forwarded-for': `1.1.1.1, ${bad}` }))).toBe('unknown');
    },
  );

  it('does not fall through to a weaker header when a stronger one is garbage', () => {
    expect(resolveClientIp(h({ 'cf-connecting-ip': 'garbage', 'x-real-ip': '8.8.8.8' }))).toBe(
      'unknown',
    );
  });
});
