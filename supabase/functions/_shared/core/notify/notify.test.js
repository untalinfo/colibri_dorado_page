import { describe, expect, it, vi } from 'vitest';
import { createEmailChannel } from './email.js';
import { escapeHtml, formatCop } from './format.js';
import { createNotifier } from './notifier.js';
import { createTelegramChannel, createTelegramClient } from './telegram.js';

const order = {
  ref: 'CD-ABC123',
  customer_name: 'Ana <b>Pérez</b>',
  customer_phone: '3001234567',
  customer_address: 'Calle 1 #2-3 & más',
  qty: 2,
  total_cop: 90000,
  receipt_path: 'id/receipt',
  receipt_mime: 'image/png',
};
const ok = () => Promise.resolve(new Response('{"ok":true}', { status: 200 }));
const bad = () => Promise.resolve(new Response('{}', { status: 500 }));
const body = (fetch, n = 0) => JSON.parse(fetch.mock.calls[n][1].body);

describe('format', () => {
  it('formats COP and escapes html', () => {
    expect(formatCop(90000)).toMatch(/90\.000/);
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('telegram channel', () => {
  const make = (fetch) =>
    createTelegramChannel({ client: createTelegramClient({ token: 'T0K', fetch }), chatId: '42' });

  it('sendPhoto for images with summary and confirm/reject keyboard, no parse_mode', async () => {
    const fetch = vi.fn(ok);
    await make(fetch).send(order, 'https://signed/x');
    expect(fetch.mock.calls[0][0]).toBe('https://api.telegram.org/botT0K/sendPhoto');
    const b = body(fetch);
    expect(b).toMatchObject({ chat_id: '42', photo: 'https://signed/x' });
    expect(b.parse_mode).toBeUndefined();
    for (const s of ['CD-ABC123', 'Ana <b>Pérez</b>', '3001234567', 'Calle 1', '2', '90.000']) {
      expect(b.caption).toContain(s);
    }
    expect(b.reply_markup.inline_keyboard[0].map((k) => k.callback_data)).toEqual([
      'c:CD-ABC123',
      'r:CD-ABC123',
    ]);
  });

  it('sendDocument for pdf', async () => {
    const fetch = vi.fn(ok);
    await make(fetch).send({ ...order, receipt_mime: 'application/pdf' }, 'https://signed/x');
    expect(fetch.mock.calls[0][0]).toMatch(/sendDocument$/);
    expect(body(fetch).document).toBe('https://signed/x');
  });

  it('falls back to sendMessage with link when media fails, and without link when no url', async () => {
    const fetch = vi.fn().mockImplementationOnce(bad).mockImplementation(ok);
    await make(fetch).send(order, 'https://signed/x');
    expect(fetch.mock.calls[1][0]).toMatch(/sendMessage$/);
    expect(body(fetch, 1).text).toContain('https://signed/x');
    const f2 = vi.fn(ok);
    await make(f2).send(order, null);
    expect(f2.mock.calls[0][0]).toMatch(/sendMessage$/);
    expect(body(f2).reply_markup).toBeDefined();
  });

  it('throws without leaking the token when everything fails', async () => {
    const err = await make(vi.fn(bad))
      .send(order, null)
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String(err.message)).not.toContain('T0K');
  });

  it('times out hung requests', async () => {
    const hung = vi.fn(
      (_u, init) =>
        new Promise((_, rej) =>
          init.signal.addEventListener('abort', () => rej(new Error('aborted'))),
        ),
    );
    const client = createTelegramClient({ token: 'T', fetch: hung, timeoutMs: 10 });
    await expect(client.call('sendMessage', {})).rejects.toThrow();
  });
});

describe('email channel', () => {
  it('posts escaped html to owner only via Resend', async () => {
    const fetch = vi.fn(ok);
    await createEmailChannel({ apiKey: 'RK', from: 'a@b.c', to: 'owner@x.y', fetch }).send(order);
    expect(fetch.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(fetch.mock.calls[0][1].headers.authorization).toBe('Bearer RK');
    const b = body(fetch);
    expect(b.to).toEqual(['owner@x.y']);
    expect(b.subject).toContain('CD-ABC123');
    expect(b.html).toContain('Ana &lt;b&gt;P');
    expect(b.html).not.toContain('<b>Pérez');
  });

  it('throws on non-2xx', async () => {
    const ch = createEmailChannel({ apiKey: 'RK', to: 'o@x.y', fetch: vi.fn(bad) });
    await expect(ch.send(order)).rejects.toThrow();
  });
});

describe('notifier', () => {
  const setup = (over = {}) => {
    const telegram = { send: vi.fn().mockResolvedValue() };
    const email = { send: vi.fn().mockResolvedValue() };
    const signReceiptUrl = vi.fn().mockResolvedValue('https://signed/x');
    const log = vi.fn();
    return {
      telegram,
      email,
      signReceiptUrl,
      log,
      n: createNotifier({ telegram, email, signReceiptUrl, log, ...over }),
    };
  };

  it('signs a 300s url and notifies both channels', async () => {
    const s = setup();
    await s.n.orderSubmitted(order);
    expect(s.signReceiptUrl).toHaveBeenCalledWith('id/receipt', 300);
    expect(s.telegram.send).toHaveBeenCalledWith(order, 'https://signed/x');
    expect(s.email.send).toHaveBeenCalledWith(order);
  });

  it('isolates channel failures (reject and sync throw) and logs only ref + error name', async () => {
    const s = setup();
    s.telegram.send.mockImplementation(() => {
      throw new TypeError('secret T0K Ana');
    });
    await s.n.orderSubmitted(order);
    expect(s.email.send).toHaveBeenCalled();
    const s2 = setup();
    s2.email.send.mockRejectedValue(new Error('x'));
    await s2.n.orderSubmitted(order);
    expect(s2.telegram.send).toHaveBeenCalled();
    const logged = JSON.stringify(s.log.mock.calls);
    expect(logged).toContain('CD-ABC123');
    expect(logged).not.toMatch(/T0K|Ana|3001234567/);
  });

  it('still sends telegram (no link) when signing fails; disabled channels are skipped', async () => {
    const s = setup({ email: null });
    s.signReceiptUrl.mockRejectedValue(new Error('x'));
    await s.n.orderSubmitted(order);
    expect(s.telegram.send).toHaveBeenCalledWith(order, null);
  });
});
