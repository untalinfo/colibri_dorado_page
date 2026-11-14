import { LOT_CODE_RE, REASON_MAX } from './constants.js';

const REF_RE = /^CD-[A-Z0-9]{6}$/;
const UNSIGNED = /^[1-9]\d{0,4}$/;
const SIGNED = /^[+-]?[1-9]\d{0,4}$/;

export const parseCode = (raw) => {
  const code = String(raw ?? '').toLowerCase();
  return LOT_CODE_RE.test(code) ? code : null;
};

// Strict: ASCII digits only, no decimals, exponent or separators, never zero.
export const parseInteger = (raw, { signed = false } = {}) => {
  const text = String(raw ?? '');
  return (signed ? SIGNED : UNSIGNED).test(text) ? Number(text) : null;
};

// Free text: rest of the line collapsed to single spaces; null when over the limit.
export const cleanReason = (words) => {
  const reason = words.join(' ').replace(/\s+/g, ' ').trim();
  return reason.length <= REASON_MAX ? reason : null;
};

const none = () => ({});
const COMMANDS = {
  ayuda: { usage: '/ayuda', args: none },
  lotes: { usage: '/lotes', args: none },
  pendientes: { usage: '/pendientes', args: none },
  pedido: {
    usage: '/pedido <ref>',
    args: ([ref, ...extra]) => {
      const upper = String(ref ?? '').toUpperCase();
      return extra.length === 0 && REF_RE.test(upper) ? { ref: upper } : null;
    },
  },
};

export const USAGE = Object.values(COMMANDS).map((c) => c.usage);

// -> { name, args } | { name, usage } | { hint: true }. Never throws on user text.
export function parseCommand(text) {
  const [first = '', ...rest] = String(text ?? '')
    .trim()
    .split(/\s+/);
  if (!first.startsWith('/')) return { hint: true };
  const name = first.slice(1).split('@')[0].toLowerCase();
  const spec = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : null;
  if (!spec) return { hint: true };
  const args = spec.args(rest);
  return args ? { name, args } : { name, usage: spec.usage };
}
