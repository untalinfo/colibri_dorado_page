// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createTelegramWebhookHandler } from './telegramWebhook.js';

const SECRET = 'whsec-test-value';
const OWNER = '4242';
const REF = 'CD-ABC234';
const NOW = new Date('2026-11-13T15:30:00Z');

const callbackUpdate = ({
  data = `c:${REF}`,
  fromId = Number(OWNER),
  chatId = Number(OWNER),
  firstName = 'Carlos',
  message = { message_id: 7, chat: { id: chatId }, caption: 'Comprobante recibido', photo: [{}] },
} = {}) => ({
  update_id: 1,
  callback_query: {
    id: 'cb1',
    from: { id: fromId, first_name: firstName },
    data,
    message,
  },
});

const orderRow = (over = {}) => ({
  id: 'o-1',
  ref: REF,
  status: 'confirmed',
  customer_name: 'Ana',
  customer_phone: '3001234567',
  customer_address: 'Calle 1',
  qty: 2,
  total_cop: 90000,
  decided_by: Number(OWNER),
  decided_by_name: 'Carlos',
  decided_at: NOW.toISOString(),
  ...over,
});

const setup = ({ changed = true, secret = SECRET, adminIds = [OWNER], rows = [], order } = {}) => {
  const db = {
    setDecision: vi.fn().mockResolvedValue({ changed, order: order ?? orderRow() }),
    listAdminMessages: vi.fn().mockResolvedValue(rows),
  };
  const telegram = { call: vi.fn().mockResolvedValue({}) };
  const log = vi.fn();
  const handler = createTelegramWebhookHandler({
    db,
    telegram,
    config: { webhookSecret: secret, adminIds },
    log,
    now: () => NOW,
  });
  const post = (body, headers = { 'x-telegram-bot-api-secret-token': SECRET }) =>
    handler(
      new Request('https://fn.example/telegram-webhook', {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  const methods = () => telegram.call.mock.calls.map(([m]) => m);
  const edits = () => telegram.call.mock.calls.filter(([m]) => m.startsWith('edit'));
  return { db, telegram, log, post, methods, edits, handler };
};

describe('telegramWebhook authentication', () => {
  it('401 on a wrong secret header', async () => {
    const { post, db, telegram } = setup();
    const res = await post(callbackUpdate(), { 'x-telegram-bot-api-secret-token': 'nope' });
    expect(res.status).toBe(401);
    expect(db.setDecision).not.toHaveBeenCalled();
    expect(telegram.call).not.toHaveBeenCalled();
  });

  it('401 on a missing header', async () => {
    const { post, db } = setup();
    expect((await post(callbackUpdate(), {})).status).toBe(401);
    expect(db.setDecision).not.toHaveBeenCalled();
  });

  it('401 on a header that only shares a prefix with the secret', async () => {
    const { post } = setup();
    const res = await post(callbackUpdate(), {
      'x-telegram-bot-api-secret-token': SECRET.slice(0, 5),
    });
    expect(res.status).toBe(401);
  });

  it.each(['', undefined])(
    'rejects everything when the configured secret is %j',
    async (secret) => {
      const { post, db } = setup({ secret });
      const empty = await post(callbackUpdate(), { 'x-telegram-bot-api-secret-token': '' });
      const none = await post(callbackUpdate(), {});
      expect([empty.status, none.status]).toEqual([401, 401]);
      expect(db.setDecision).not.toHaveBeenCalled();
    },
  );

  it('rejects non-POST methods with 405 after authentication', async () => {
    const { handler } = setup();
    const headers = { 'x-telegram-bot-api-secret-token': SECRET };
    const res = await handler(new Request('https://fn.example/telegram-webhook', { headers }));
    expect(res.status).toBe(405);
  });
});

describe('telegramWebhook updates', () => {
  it('ignores non callback_query updates with 200', async () => {
    const { post, db, telegram } = setup();
    const res = await post({ update_id: 2, message: { text: 'hi' } });
    expect(res.status).toBe(200);
    expect(db.setDecision).not.toHaveBeenCalled();
    expect(telegram.call).not.toHaveBeenCalled();
  });

  it('200 on malformed JSON', async () => {
    const { post, db } = setup();
    expect((await post('{not json')).status).toBe(200);
    expect(db.setDecision).not.toHaveBeenCalled();
  });

  it.each([
    ['other sender', { fromId: 999 }],
    ['other chat', { chatId: 999 }],
    ['no message', { message: null }],
  ])('non-admin (%s): neutral answer, no DB change, no edit (S5.5)', async (_n, over) => {
    const { post, db, methods, telegram } = setup();
    const res = await post(callbackUpdate(over));
    expect(res.status).toBe(200);
    expect(db.setDecision).not.toHaveBeenCalled();
    expect(methods()).toEqual(['answerCallbackQuery']);
    expect(telegram.call.mock.calls[0][1]).toMatchObject({
      callback_query_id: 'cb1',
      text: 'Acción no disponible',
    });
  });

  it('compares ids as strings (string chat id works)', async () => {
    const { post, db } = setup();
    await post(callbackUpdate({ fromId: OWNER, chatId: OWNER }));
    expect(db.setDecision).toHaveBeenCalledOnce();
  });

  it('empty admin set: callbacks get "Acción no disponible" and the config error is logged', async () => {
    const { post, db, telegram, log } = setup({ adminIds: [] });
    const res = await post(callbackUpdate());
    expect(res.status).toBe(200);
    expect(db.setDecision).not.toHaveBeenCalled();
    expect(telegram.call.mock.calls[0][1].text).toBe('Acción no disponible');
    expect(log).toHaveBeenCalledWith('admin_config_empty', {});
  });

  it.each([
    'c:cd-abc234',
    'x:CD-ABC234',
    'c:CD-ABC23',
    'c:CD-ABC2345',
    'c:CD-ABC234\n',
    'c:',
    '',
    'c:CD-ABC234:r',
  ])('invalid callback data %j: answer only', async (data) => {
    const { post, db, methods } = setup();
    const res = await post(callbackUpdate({ data }));
    expect(res.status).toBe(200);
    expect(db.setDecision).not.toHaveBeenCalled();
    expect(methods()).toEqual(['answerCallbackQuery']);
  });
});

describe('telegramWebhook decisions', () => {
  it('records decided_by with a sanitized plain-text name (D5)', async () => {
    const { post, db } = setup();
    await post(callbackUpdate({ firstName: `  ${'Z'.repeat(40)}  ` }));
    expect(db.setDecision).toHaveBeenCalledWith(REF, 'confirmed', OWNER, 'Z'.repeat(32));
    const none = setup();
    await none.post(callbackUpdate({ firstName: null, data: `r:${REF}` }));
    expect(none.db.setDecision).toHaveBeenCalledWith(REF, 'rejected', OWNER, 'admin');
  });

  it('confirm on a media alert: editMessageCaption without buttons, then answers', async () => {
    const { post, telegram, methods } = setup({
      rows: [{ chat_id: 4242, message_id: 7, has_media: true }],
    });
    const res = await post(callbackUpdate());
    expect(res.status).toBe(200);
    expect(methods()).toEqual(['editMessageCaption', 'answerCallbackQuery']);
    const edit = telegram.call.mock.calls[0][1];
    expect(edit).toMatchObject({
      chat_id: OWNER,
      message_id: 7,
      reply_markup: { inline_keyboard: [] },
    });
    expect(edit.caption).toContain('Comprobante recibido CD-ABC234');
    expect(edit.caption).toContain('✅ Confirmado por Carlos · 10:30 13/11');
    expect(edit.caption.length).toBeLessThan(1024);
    expect(edit.parse_mode).toBeUndefined();
    expect(telegram.call.mock.calls[1][1].text).toBe('✅ Confirmado');
  });

  it('reject on a text alert uses editMessageText', async () => {
    const message = { message_id: 9, chat: { id: Number(OWNER) }, text: 'resumen' };
    const { post, methods, telegram } = setup({
      order: orderRow({ status: 'rejected' }),
      rows: [{ chat_id: 4242, message_id: 9, has_media: false }],
    });
    await post(callbackUpdate({ data: `r:${REF}`, message }));
    expect(methods()).toEqual(['editMessageText', 'answerCallbackQuery']);
    expect(telegram.call.mock.calls[0][1].text).toContain('❌ Rechazado por Carlos');
  });

  it('syncs every admin copy with the decider, no buttons (S5.1)', async () => {
    const rows = [
      { chat_id: 4242, message_id: 7, has_media: true },
      { chat_id: 5555, message_id: 21, has_media: false },
    ];
    const { post, edits, db } = setup({ adminIds: [OWNER, '5555'], rows });
    await post(callbackUpdate());
    expect(db.listAdminMessages).toHaveBeenCalledWith('o-1');
    expect(edits().map(([m, p]) => [m, p.chat_id, p.message_id])).toEqual([
      ['editMessageCaption', '4242', 7],
      ['editMessageText', '5555', 21],
    ]);
    for (const [, p] of edits()) {
      expect(p.reply_markup).toEqual({ inline_keyboard: [] });
      expect(`${p.caption ?? p.text}`).toContain('Confirmado por Carlos');
    }
  });

  it('later tap by another admin: "Ya procesado", own copy synced to the first decision (S5.2)', async () => {
    const rows = [{ chat_id: 5555, message_id: 21, has_media: false }];
    const message = { message_id: 21, chat: { id: 5555 }, text: 'x' };
    const { post, telegram, methods, edits } = setup({
      changed: false,
      adminIds: [OWNER, '5555'],
      rows,
    });
    await post(callbackUpdate({ fromId: 5555, chatId: 5555, data: `r:${REF}`, message }));
    expect(methods()).toEqual(['editMessageText', 'answerCallbackQuery']);
    expect(edits()).toHaveLength(1);
    expect(telegram.call.mock.calls[0][1].text).toContain('✅ Confirmado por Carlos');
    expect(telegram.call.mock.calls[1][1].text).toBe('Ya procesado');
  });

  it('a failing edit never undoes the decision nor blocks the others (S5.3)', async () => {
    const rows = [
      { chat_id: 4242, message_id: 7, has_media: true },
      { chat_id: 5555, message_id: 21, has_media: false },
      { chat_id: 6666, message_id: 30, has_media: false },
    ];
    const { post, telegram, log, edits } = setup({ adminIds: [OWNER, '5555', '6666'], rows });
    telegram.call.mockImplementation(async (_m, p) => {
      if (p.chat_id === '5555') throw new Error('telegram editMessageText http 403');
      return {};
    });
    expect((await post(callbackUpdate())).status).toBe(200);
    expect(edits()).toHaveLength(3);
    expect(log).toHaveBeenCalledWith('decision_sync_failed', {
      ref: REF,
      chat_id: '5555',
      error: 'Error',
    });
    expect(telegram.call.mock.calls.at(-1)[1].text).toBe('✅ Confirmado');
  });

  it('concurrent taps yield a single decision (S5.4)', async () => {
    const { post, db, telegram } = setup({
      rows: [{ chat_id: 4242, message_id: 7, has_media: true }],
    });
    db.setDecision
      .mockResolvedValueOnce({ changed: true, order: orderRow() })
      .mockResolvedValueOnce({ changed: false, order: orderRow() });
    await Promise.all([post(callbackUpdate()), post(callbackUpdate({ data: `r:${REF}` }))]);
    const answers = telegram.call.mock.calls
      .filter(([m]) => m === 'answerCallbackQuery')
      .map(([, p]) => p.text)
      .sort();
    expect(answers).toEqual(['Ya procesado', '✅ Confirmado']);
    expect(db.listAdminMessages).toHaveBeenCalledOnce();
  });

  it('legacy order without rows edits only the tapped message (S5.7)', async () => {
    const message = { message_id: 3, chat: { id: Number(OWNER) }, caption: 'c', document: {} };
    const { post, methods, telegram } = setup({ rows: [] });
    await post(callbackUpdate({ message }));
    expect(methods()).toEqual(['editMessageCaption', 'answerCallbackQuery']);
    expect(telegram.call.mock.calls[0][1]).toMatchObject({ chat_id: OWNER, message_id: 3 });
  });

  it('still edits the tapped message when listing copies fails', async () => {
    const { post, db, methods, log } = setup();
    db.listAdminMessages.mockRejectedValue(new TypeError('db down'));
    expect((await post(callbackUpdate())).status).toBe(200);
    expect(methods()).toEqual(['editMessageCaption', 'answerCallbackQuery']);
    expect(log).toHaveBeenCalledWith('admin_messages_failed', { ref: REF, error: 'TypeError' });
  });

  it('keeps huge captions and texts under the limits (S5.6)', async () => {
    const big = orderRow({ customer_address: 'x'.repeat(6000) });
    const rows = [
      { chat_id: 4242, message_id: 7, has_media: true },
      { chat_id: 5555, message_id: 8, has_media: false },
    ];
    const { post, edits } = setup({ adminIds: [OWNER, '5555'], rows, order: big });
    await post(callbackUpdate());
    const [cap, txt] = edits();
    expect(cap[1].caption.length).toBeLessThan(1024);
    expect(txt[1].text.length).toBeLessThan(4096);
    expect(`${cap[1].caption}${txt[1].text}`).not.toMatch(/nequi/);
  });

  it('ignores a malformed ref without touching the DB', async () => {
    const { post, db, methods } = setup();
    const res = await post(callbackUpdate({ data: 'c:CD-abc' }));
    expect(res.status).toBe(200);
    expect(db.setDecision).not.toHaveBeenCalled();
    expect(methods()).toEqual(['answerCallbackQuery']);
  });

  it('unknown ref (no order): "Ya procesado", no edits', async () => {
    const { post, db, methods } = setup({ changed: false });
    db.setDecision.mockResolvedValue({ changed: false, order: null });
    await post(callbackUpdate());
    expect(methods()).toEqual(['answerCallbackQuery']);
  });

  it('200 on internal DB errors, logging only ref and error name', async () => {
    const { post, db, log, telegram } = setup();
    db.setDecision.mockRejectedValue(new TypeError(`boom ${SECRET} 3000000000`));
    const res = await post(callbackUpdate());
    expect(res.status).toBe(200);
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(log.mock.calls)).not.toContain('3000000000');
    expect(log).toHaveBeenCalledWith('webhook_error', { ref: REF, error: 'TypeError' });
    expect(telegram.call.mock.calls.at(-1)[0]).toBe('answerCallbackQuery');
  });

  it('200 even when every Telegram call fails', async () => {
    const { post, telegram } = setup();
    telegram.call.mockRejectedValue(new Error('down'));
    expect((await post(callbackUpdate())).status).toBe(200);
  });
});

describe('telegramWebhook message router (S2)', () => {
  const route = ({ adminIds = [OWNER], run } = {}) => {
    const commands = { run: run ?? vi.fn().mockResolvedValue('respuesta') };
    const db = { setDecision: vi.fn(), listAdminMessages: vi.fn() };
    const telegram = { call: vi.fn().mockResolvedValue({}) };
    const log = vi.fn();
    const handler = createTelegramWebhookHandler({
      db,
      telegram,
      commands,
      config: { webhookSecret: SECRET, adminIds },
      log,
      now: () => NOW,
    });
    const send = (message, updateId = 77) =>
      handler(
        new Request('https://fn.example/telegram-webhook', {
          method: 'POST',
          headers: { 'x-telegram-bot-api-secret-token': SECRET },
          body: JSON.stringify({ update_id: updateId, message }),
        }),
      );
    return { commands, db, telegram, log, send };
  };
  const adminMsg = (text, id = Number(OWNER)) => ({
    message_id: 1,
    from: { id, first_name: 'Carlos' },
    chat: { id, type: 'private' },
    text,
  });

  it('ignores non-admins with an empty 200, no outbound call, no DB (S1.1)', async () => {
    const { send, telegram, commands, db } = route();
    const res = await send(adminMsg('/lotes', 999));
    expect(res.status).toBe(200);
    expect(telegram.call).not.toHaveBeenCalled();
    expect(commands.run).not.toHaveBeenCalled();
    expect(db.setDecision).not.toHaveBeenCalled();
  });

  it('ignores an admin writing in a group (S1.2)', async () => {
    const { send, telegram, commands } = route();
    const msg = { ...adminMsg('/lotes'), chat: { id: -100, type: 'group' } };
    expect((await send(msg)).status).toBe(200);
    expect(telegram.call).not.toHaveBeenCalled();
    expect(commands.run).not.toHaveBeenCalled();
  });

  it('with no admins configured: no outbound, config error logged, 200 (S1.6)', async () => {
    const { send, telegram, log } = route({ adminIds: [] });
    expect((await send(adminMsg('/lotes'))).status).toBe(200);
    expect(telegram.call).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('admin_config_empty', {});
  });

  it('runs the parsed command and replies in plain text without parse_mode', async () => {
    const { send, telegram, commands } = route();
    await send(adminMsg('/PEDIDO@bot cd-abc234'), 55);
    expect(commands.run).toHaveBeenCalledWith(
      { name: 'pedido', args: { ref: 'CD-ABC234' } },
      { adminId: OWNER, updateId: 55 },
    );
    expect(telegram.call).toHaveBeenCalledTimes(1);
    const [method, payload] = telegram.call.mock.calls[0];
    expect(method).toBe('sendMessage');
    expect(payload).toEqual({ chat_id: OWNER, text: 'respuesta' });
  });

  it('sends long output as sequential chunks, each under 4096', async () => {
    const long = Array.from({ length: 40 }, () => 'x'.repeat(249)).join('\n');
    const { send, telegram } = route({ run: vi.fn().mockResolvedValue(long) });
    await send(adminMsg('/lotes'));
    const texts = telegram.call.mock.calls.map(([, p]) => p.text);
    expect(texts.length).toBeGreaterThanOrEqual(2);
    for (const t of texts) expect(t.length).toBeLessThan(4096);
  });

  it('answers 200 with a generic reply when the command fails (R1.17)', async () => {
    const { send, telegram, log } = route({ run: vi.fn().mockRejectedValue(new Error('db down')) });
    const res = await send(adminMsg('/lotes'));
    expect(res.status).toBe(200);
    expect(telegram.call.mock.calls[0][1].text).toContain('reintenta');
    expect(JSON.stringify(log.mock.calls)).not.toContain('db down');
  });

  it('still answers 200 when sending fails', async () => {
    const { send, telegram } = route();
    telegram.call.mockRejectedValue(new Error('blocked'));
    expect((await send(adminMsg('/lotes'))).status).toBe(200);
  });

  it('ignores updates that carry neither callback nor text message', async () => {
    const { send, telegram } = route();
    const msg = {
      message_id: 1,
      from: { id: Number(OWNER) },
      chat: { id: Number(OWNER), type: 'private' },
    };
    expect((await send(msg)).status).toBe(200);
    expect(telegram.call).not.toHaveBeenCalled();
  });
});
