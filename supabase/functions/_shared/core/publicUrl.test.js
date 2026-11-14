// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toPublicUrl } from './publicUrl.js';

const signed = 'http://kong:8000/storage/v1/object/upload/sign/receipts/abc/receipt?token=t';

describe('toPublicUrl', () => {
  it('rewrites the internal origin to the public one, keeping path and query', () => {
    expect(toPublicUrl(signed, 'http://kong:8000', 'http://127.0.0.1:54321')).toBe(
      'http://127.0.0.1:54321/storage/v1/object/upload/sign/receipts/abc/receipt?token=t',
    );
  });

  it('is a no-op when no public origin is configured (production)', () => {
    const prod = 'https://abc.supabase.co/storage/v1/object/upload/sign/x?token=t';
    expect(toPublicUrl(prod, 'https://abc.supabase.co', undefined)).toBe(prod);
    expect(toPublicUrl(prod, 'https://abc.supabase.co', '')).toBe(prod);
  });

  it('tolerates trailing slashes on either origin', () => {
    expect(toPublicUrl(signed, 'http://kong:8000/', 'http://127.0.0.1:54321/')).toBe(
      'http://127.0.0.1:54321/storage/v1/object/upload/sign/receipts/abc/receipt?token=t',
    );
  });

  it('leaves URLs from other origins untouched', () => {
    const other = 'https://elsewhere.test/storage/x';
    expect(toPublicUrl(other, 'http://kong:8000', 'http://127.0.0.1:54321')).toBe(other);
  });
});
