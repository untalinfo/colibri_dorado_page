const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^[0-9a-fA-F:.]{2,45}$/;

const looksLikeIp = (value) =>
  IPV4.test(value) || (IPV6.test(value) && (value.match(/:/g) ?? []).length >= 2);

// Pure and injectable: the shell can override once the platform header is confirmed.
// Never trusts the leftmost x-forwarded-for hop (client-controlled).
// A malformed value from the chosen header yields 'unknown' (no fall-through to weaker headers).
export function resolveClientIp(headers) {
  const cf = headers.get('cf-connecting-ip');
  const real = headers.get('x-real-ip');
  const xff = headers.get('x-forwarded-for');
  let raw = '';
  if (cf?.trim()) raw = cf;
  else if (real?.trim()) raw = real;
  else if (xff?.trim()) raw = xff.split(',').at(-1);
  const candidate = raw.trim();
  return candidate && looksLikeIp(candidate) ? candidate : 'unknown';
}
