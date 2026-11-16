// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { whatsappUrl } from './contact';

describe('whatsappUrl', () => {
  it('builds a wa.me link with an encoded greeting', () => {
    const url = new URL(whatsappUrl());
    expect(url.origin + url.pathname).toBe('https://wa.me/573108233269');
    expect(url.searchParams.get('text')).toBe(
      'Hola, quiero información sobre la miel Colibrí Dorado.',
    );
  });
});
