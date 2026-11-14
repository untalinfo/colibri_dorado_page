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
  message = { message_id: 7, chat: { id: chatId }, caption: 'Comprobante recibido', photo: [{}] },
} = {}) => ({
  update_id: 1,
  callback_query: { id: 'cb1', from: { id: fromId }, data, message },
});

const setup = ({ changed = true, secret = SECRET, owner = OWNER } = {}) => {
  const db = {
    setDecision: vi.fn().mockResolvedValue({ changed, order: { ref: REF, status: 'confirmed' } }),
  };
  const telegram = { call: vi.fn().mockResolvedValue(undefined) };
  const log = vi.fn();
  const handler = createTelegramWebhookHandler({
    db,
    telegram,
    config: { webhookSecret: secret, ownerChatId: owner },
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
  return { db, telegram, log, post, methods, handler };
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
  ])('non-owner (%s): neutral answer, no DB change, no edit', async (_n, over) => {
    const { post, db, methods, telegram } = setup();
    const res = await post(callbackUpdate(over));
    expect(res.status).toBe(200);
    expect(db.setDecision).not.toHaveBeenCalled();
    expect(methods()).toEqual(['answerCallbackQuery']);
    expect(telegram.call.mock.calls[0][1].callback_query_id).toBe('cb1');
  });

  it('compares ids as strings (string chat id works)', async () => {
    const { post, db } = setup();
    await post(callbackUpdate({ fromId: OWNER, chatId: OWNER }));
    expect(db.setDecision).toHaveBeenCalledOnce();
  });

  it('does nothing for an unconfigured owner id', async () => {
    const { post, db } = setup({ owner: '' });
    await post(callbackUpdate({ fromId: '', chatId: '' }));
    expect(db.setDecision).not.toHaveBeenCalled();
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
  it('confirm: sets confirmed, edits caption (photo) without keyboard, answers', async () => {
    const { post, db, telegram, methods } = setup();
    const res = await post(callbackUpdate());
    expect(res.status).toBe(200);
    expect(db.setDecision).toHaveBeenCalledWith(REF, 'confirmed');
    expect(methods()).toEqual(['editMessageCaption', 'answerCallbackQuery']);
    const edit = telegram.call.mock.calls[0][1];
    expect(edit).toMatchObject({
      chat_id: OWNER,
      message_id: 7,
      reply_markup: { inline_keyboard: [] },
    });
    expect(edit.caption).toContain('Comprobante recibido');
    expect(edit.caption).toContain('✅ Confirmado');
    expect(edit.caption).toContain('2026-11-13');
    expect(edit.parse_mode).toBeUndefined();
  });

  it('reject on a text message uses editMessageText', async () => {
    const { post, db, telegram, methods } = setup();
    const message = {
      message_id: 9,
      chat: { id: Number(OWNER) },
      text: 'resumen\nComprobante: https://x',
    };
    await post(callbackUpdate({ data: `r:${REF}`, message }));
    expect(db.setDecision).toHaveBeenCalledWith(REF, 'rejected');
    expect(methods()).toEqual(['editMessageText', 'answerCallbackQuery']);
    const edit = telegram.call.mock.calls[0][1];
    expect(edit.text).toContain('resumen');
    expect(edit.text).toContain('❌ Rechazado');
    expect(edit.reply_markup).toEqual({ inline_keyboard: [] });
  });

  it('document messages are edited via caption', async () => {
    const { post, methods } = setup();
    const message = { message_id: 3, chat: { id: Number(OWNER) }, caption: 'c', document: {} };
    await post(callbackUpdate({ message }));
    expect(methods()[0]).toBe('editMessageCaption');
  });

  it('keeps a long text within the 4096 limit after appending the decision', async () => {
    const { post, telegram } = setup();
    const message = { message_id: 4, chat: { id: Number(OWNER) }, text: 'y'.repeat(4096) };
    await post(callbackUpdate({ message }));
    const { text } = telegram.call.mock.calls[0][1];
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain('✅ Confirmado');
  });

  it('ignores a malformed ref without touching the DB', async () => {
    const { post, db, methods } = setup();
    const res = await post(callbackUpdate({ data: 'c:CD-abc' }));
    expect(res.status).toBe(200);
    expect(db.setDecision).not.toHaveBeenCalled();
    expect(methods()).toEqual(['answerCallbackQuery']);
  });

  it('keeps a long caption within the 1024 limit after appending the decision', async () => {
    const { post, telegram } = setup();
    const message = {
      message_id: 3,
      chat: { id: Number(OWNER) },
      caption: 'x'.repeat(1024),
      photo: [{}],
    };
    await post(callbackUpdate({ message }));
    const { caption } = telegram.call.mock.calls[0][1];
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(caption).toContain('✅ Confirmado');
  });

  it('double tap / other state: "Ya procesado", no edit', async () => {
    const { post, methods, telegram } = setup({ changed: false });
    const res = await post(callbackUpdate());
    expect(res.status).toBe(200);
    expect(methods()).toEqual(['answerCallbackQuery']);
    expect(telegram.call.mock.calls[0][1].text).toBe('Ya procesado');
  });

  it('still answers when the edit fails', async () => {
    const { post, telegram, methods } = setup();
    telegram.call.mockImplementation(async (m) => {
      if (m.startsWith('edit')) throw new Error('telegram editMessageCaption http 400');
    });
    expect((await post(callbackUpdate())).status).toBe(200);
    expect(methods()).toEqual(['editMessageCaption', 'answerCallbackQuery']);
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

  it('200 even when Telegram answer calls fail', async () => {
    const { post, telegram } = setup();
    telegram.call.mockRejectedValue(new Error('down'));
    expect((await post(callbackUpdate())).status).toBe(200);
  });
});
