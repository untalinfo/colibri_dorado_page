const ID = /^\d{1,15}$/;

const parseList = (raw) => [
  ...new Set(
    String(raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ID.test(s)),
  ),
];

// Divergence from design (`fallback` on empty): OWNER_CHAT_ID is used ONLY when ADMIN_CHAT_IDS is
// unset/blank. A set-but-invalid list yields [] (fail closed, spec A1/S1.4). Negative ids are dropped.
export function parseAdminIds(rawIds, rawOwner) {
  if (String(rawIds ?? '').trim() === '') return parseList(rawOwner).slice(0, 1);
  return parseList(rawIds);
}

const same = (a, b) => a != null && b != null && String(a) === String(b);

export function isAdminMessage(msg, ids) {
  const { chat, from } = msg ?? {};
  return chat?.type === 'private' && same(from?.id, chat?.id) && ids.includes(String(chat.id));
}

export function isAdminCallback(query, ids) {
  const chatId = query?.message?.chat?.id;
  return same(query?.from?.id, chatId) && ids.includes(String(chatId));
}
