import { describe, expect, it } from 'vitest';
import { isAdminCallback, isAdminMessage, parseAdminIds } from './admins.js';

describe('parseAdminIds', () => {
  it('splits, trims, drops junk and dedupes (S1.3)', () => {
    expect(parseAdminIds('111, abc,222,,111', undefined)).toEqual(['111', '222']);
  });

  it('drops negative (group) ids (A2)', () => {
    expect(parseAdminIds('-100123,333', '')).toEqual(['333']);
  });

  it.each([undefined, '', '   '])(
    'falls back to OWNER_CHAT_ID when ADMIN_CHAT_IDS is %j (S1.5)',
    (raw) => {
      expect(parseAdminIds(raw, '111')).toEqual(['111']);
    },
  );

  it('fails closed when ADMIN_CHAT_IDS is set but has no valid entry, even with owner (S1.4)', () => {
    expect(parseAdminIds('abc,,x1', '111')).toEqual([]);
  });

  it('returns [] when both are unset or the owner is invalid', () => {
    expect(parseAdminIds(undefined, undefined)).toEqual([]);
    expect(parseAdminIds('', ' ')).toEqual([]);
    expect(parseAdminIds(undefined, 'nope')).toEqual([]);
  });

  it('ADMIN_CHAT_IDS wins when both are set', () => {
    expect(parseAdminIds('222', '111')).toEqual(['222']);
  });
});

describe('isAdminMessage', () => {
  const ids = ['111', '222'];
  const msg = (over = {}) => ({ chat: { id: 111, type: 'private' }, from: { id: 111 }, ...over });

  it('accepts a private message from an admin in their own chat', () => {
    expect(isAdminMessage(msg(), ids)).toBe(true);
    expect(
      isAdminMessage(msg({ chat: { id: '222', type: 'private' }, from: { id: 222 } }), ids),
    ).toBe(true);
  });

  it.each([
    ['group', { chat: { id: 111, type: 'group' } }],
    ['channel', { chat: { id: 111, type: 'channel' } }],
    ['missing from', { from: undefined }],
    ['from differs from chat', { from: { id: 222 } }],
    ['non-admin', { chat: { id: 999, type: 'private' }, from: { id: 999 } }],
    ['missing chat', { chat: undefined }],
  ])('rejects %s', (_n, over) => {
    expect(isAdminMessage(msg(over), ids)).toBe(false);
  });

  it('rejects everything on an empty set and on a missing message', () => {
    expect(isAdminMessage(msg(), [])).toBe(false);
    expect(isAdminMessage(undefined, ids)).toBe(false);
  });
});

describe('isAdminCallback', () => {
  const ids = ['111'];
  const q = (over = {}) => ({ from: { id: 111 }, message: { chat: { id: 111 } }, ...over });

  it('accepts when from and chat match an admin', () => {
    expect(isAdminCallback(q(), ids)).toBe(true);
  });

  it.each([
    ['other sender', { from: { id: 5 } }],
    ['other chat', { message: { chat: { id: 5 } } }],
    ['no message', { message: null }],
  ])('rejects %s', (_n, over) => {
    expect(isAdminCallback(q(over), ids)).toBe(false);
  });

  it('rejects on an empty set', () => {
    expect(isAdminCallback(q(), [])).toBe(false);
  });
});
