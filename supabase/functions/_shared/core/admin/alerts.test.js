import { describe, expect, it, vi } from 'vitest';
import { renderDecided, syncDecision } from './alerts.js';

const order = {
  id: 'o-1',
  ref: 'CD-ABC123',
  status: 'confirmed',
  customer_name: 'Ana',
  customer_phone: '3001234567',
  customer_address: 'Calle 1',
  qty: 2,
  total_cop: 90000,
  decided_by_name: 'Carlos',
  decided_at: '2026-11-13T15:30:00Z',
};

describe('renderDecided', () => {
  it('re-renders the summary with the decider and Bogota time (D6)', () => {
    const text = renderDecided(order, 4096);
    expect(text).toContain('Comprobante recibido CD-ABC123');
    expect(text).toContain('✅ Confirmado por Carlos · 10:30 13/11');
  });

  it('uses the reject label and a fallback name', () => {
    const text = renderDecided({ ...order, status: 'rejected', decided_by_name: null }, 4096);
    expect(text).toContain('❌ Rechazado por admin · 10:30 13/11');
  });

  it('stays under the limit and keeps the decision line for huge fields', () => {
    const big = { ...order, customer_address: 'x'.repeat(5000) };
    const text = renderDecided(big, 1024);
    expect(text.length).toBeLessThanOrEqual(1024);
    expect(text).toContain('✅ Confirmado por Carlos');
  });

  it('never renders nequi fields', () => {
    expect(renderDecided({ ...order, nequi_number: '3009999999' }, 4096)).not.toMatch(
      /nequi|3009999999/,
    );
  });
});

describe('syncDecision', () => {
  const targets = [
    { chat_id: 111, message_id: 1, has_media: true },
    { chat_id: 222, message_id: 2, has_media: false },
    { chat_id: 333, message_id: 3, has_media: true },
  ];

  it('edits every copy with the right method and no buttons', async () => {
    const telegram = { call: vi.fn().mockResolvedValue({}) };
    await syncDecision({ telegram, log: vi.fn(), targets, order });
    const calls = telegram.call.mock.calls;
    expect(calls.map(([m]) => m)).toEqual([
      'editMessageCaption',
      'editMessageText',
      'editMessageCaption',
    ]);
    expect(calls[0][1]).toMatchObject({
      chat_id: '111',
      message_id: 1,
      reply_markup: { inline_keyboard: [] },
    });
    expect(calls[0][1].caption.length).toBeLessThan(1024);
    expect(calls[1][1].text).toContain('Confirmado por Carlos');
    expect(calls[0][1].parse_mode).toBeUndefined();
  });

  it('one failing edit is logged and does not block the others (S5.3)', async () => {
    const telegram = {
      call: vi.fn(async (_m, p) => {
        if (p.chat_id === '222') throw new Error('http 403');
        return {};
      }),
    };
    const log = vi.fn();
    await syncDecision({ telegram, log, targets, order });
    expect(telegram.call).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith('decision_sync_failed', {
      ref: 'CD-ABC123',
      chat_id: '222',
      error: 'Error',
    });
  });

  it('caption and text stay strictly under the limits for huge orders (S5.6)', async () => {
    const telegram = { call: vi.fn().mockResolvedValue({}) };
    const big = { ...order, customer_address: 'x'.repeat(9000) };
    await syncDecision({ telegram, log: vi.fn(), targets, order: big });
    const [cap, txt] = telegram.call.mock.calls;
    expect(cap[1].caption.length).toBeLessThan(1024);
    expect(txt[1].text.length).toBeLessThan(4096);
  });

  it('does nothing without targets', async () => {
    const telegram = { call: vi.fn() };
    await syncDecision({ telegram, log: vi.fn(), targets: [], order });
    expect(telegram.call).not.toHaveBeenCalled();
  });
});
