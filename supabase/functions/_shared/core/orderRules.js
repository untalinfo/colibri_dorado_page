// Pure validation shared by Edge Functions and the SPA. No runtime-specific imports.
const PHONE_RE = /^3\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Zero-width and BOM characters that would let "invisible" text pass as non-empty.
const INVISIBLE_RE = /[​-‍⁠﻿]/g;

export const MAX_LENGTHS = { lotSlug: 64, name: 100, address: 300, email: 254 };

export function normalizePhone(raw) {
  let p = String(raw ?? '').replace(/[\s\-().]/g, '');
  p = p.replace(/^(\+?57|0057)(?=3)/, '');
  return p;
}

const text = (v) =>
  typeof v === 'string' ? v.normalize('NFKC').replace(INVISIBLE_RE, '').trim() : '';

// Any value other than empty/missing means a bot filled the hidden field.
function isHoneypotHit(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function checkText(errors, field, value, { required }) {
  if (!value) {
    if (required) errors[field] = 'required';
  } else if (value.length > MAX_LENGTHS[field]) {
    errors[field] = 'too_long';
  }
}

export function validateOrderInput(body, maxPerOrder) {
  // Config error, not user error: never let a bad config remove the upper bound.
  if (!Number.isInteger(maxPerOrder) || maxPerOrder < 1) {
    throw new TypeError('INVALID_MAX_PER_ORDER');
  }
  if (!body || typeof body !== 'object') return { ok: false, errors: { body: 'invalid' } };
  // Checked first so bots get the same success-looking answer regardless of other fields.
  if (isHoneypotHit(body.website)) return { ok: true, honeypot: true };

  const errors = {};
  const c = body.customer && typeof body.customer === 'object' ? body.customer : {};

  const lotSlug = text(body.lotSlug);
  checkText(errors, 'lotSlug', lotSlug, { required: true });
  if (!Number.isInteger(body.qty) || body.qty < 1 || body.qty > maxPerOrder) errors.qty = 'range';
  const name = text(c.name);
  checkText(errors, 'name', name, { required: true });
  const phone = normalizePhone(c.phone);
  if (!PHONE_RE.test(phone)) errors.phone = 'invalid';
  const address = text(c.address);
  checkText(errors, 'address', address, { required: true });
  const email = text(c.email);
  checkText(errors, 'email', email, { required: false });
  if (email && !errors.email && !EMAIL_RE.test(email)) errors.email = 'invalid';
  if (body.consent !== true) errors.consent = 'required';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    honeypot: false,
    value: { lotSlug, qty: body.qty, customer: { name, phone, address, email } },
  };
}
