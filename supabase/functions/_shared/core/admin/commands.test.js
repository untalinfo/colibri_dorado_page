// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createAdminCommands } from './commands.js';
import { parseCommand } from './parse.js';

const NOW = new Date('2026-11-14T15:00:00Z');
const setup = (over = {}) => {
  const db = {
    lotOverview: vi.fn().mockResolvedValue([]),
    listPending: vi.fn().mockResolvedValue([]),
    getOrder: vi.fn().mockResolvedValue(null),
    ...over,
  };
  const commands = createAdminCommands({ db, now: () => NOW });
  const run = (text) => commands.run(parseCommand(text), { adminId: '1', updateId: 9 });
  return { db, run };
};
const noDb = (db) => {
  for (const fn of Object.values(db)) expect(fn).not.toHaveBeenCalled();
};

describe('admin commands', () => {
  it('/ayuda lists the commands without touching the DB (R1.8)', async () => {
    const { db, run } = setup();
    expect(await run('/ayuda')).toContain('/pendientes');
    noDb(db);
  });

  it('hints on unknown commands and plain text (S1.14)', async () => {
    const { db, run } = setup();
    expect(await run('/foo')).toContain('/ayuda');
    expect(await run('hola')).toContain('/ayuda');
    noDb(db);
  });

  it('/lotes renders the overview (R1.9)', async () => {
    const { run } = setup({
      lotOverview: vi
        .fn()
        .mockResolvedValue([
          { code: 'm500', name: 'Miel', price_cop: 38000, stock: 10, available: 4, active: true },
        ]),
    });
    expect(await run('/lotes')).toContain('m500');
  });

  it('/pendientes asks for the 20 most recent (R1.10)', async () => {
    const { db, run } = setup();
    expect(await run('/pendientes')).toBe('Sin pedidos pendientes');
    expect(db.listPending).toHaveBeenCalledWith(20);
  });

  it('/pedido: found, not found, malformed without DB (R1.11)', async () => {
    const order = {
      ref: 'CD-ABC234',
      status: 'pending_verification',
      qty: 1,
      total_cop: 38000,
      customer_name: 'Ana',
      customer_phone: '3001234567',
      customer_address: 'Calle 1',
      created_at: '2026-11-14T12:00:00Z',
      lots: { code: 'm500' },
    };
    const found = setup({ getOrder: vi.fn().mockResolvedValue(order) });
    expect(await found.run('/pedido cd-abc234')).toContain('Ana');
    expect(found.db.getOrder).toHaveBeenCalledWith('CD-ABC234');

    const missing = setup();
    expect(await missing.run('/pedido CD-ZZZZZZ')).toBe('Pedido no encontrado');

    const bad = setup();
    expect(await bad.run('/pedido 123')).toBe('Uso: /pedido <ref>');
    noDb(bad.db);
  });

  describe('stock adjustments', () => {
    const adjust = (result) => ({ adjustStock: vi.fn().mockResolvedValue(result) });

    it('/agregar adds stock and confirms before, after and available (R2.8)', async () => {
      const { db, run } = setup(adjust({ stock: 34, available: 30, replayed: false }));
      expect(await run('/agregar m500 24')).toBe('Stock m500: 10 → 34 (disponibles 30)');
      expect(db.adjustStock).toHaveBeenCalledWith({
        code: 'm500',
        delta: 24,
        kind: 'add',
        reason: '',
        adminId: '1',
        updateId: 9,
      });
    });

    it('/corregir sends a signed delta with the reason', async () => {
      const { db, run } = setup(adjust({ stock: 5, available: 0, replayed: false }));
      expect(await run('/corregir m500 -15 se rompió')).toBe('Stock m500: 20 → 5 (disponibles 0)');
      expect(db.adjustStock).toHaveBeenCalledWith({
        code: 'm500',
        delta: -15,
        kind: 'correct',
        reason: 'se rompió',
        adminId: '1',
        updateId: 9,
      });
    });

    it('says a replayed update was already applied', async () => {
      const { run } = setup(adjust({ stock: 34, available: 30, replayed: true }));
      const text = await run('/agregar m500 24');
      expect(text).toContain('Ya aplicado');
      expect(text).toContain('10 → 34');
    });

    it('explains the maximum reduction on BELOW_HELD', async () => {
      const { run } = setup(adjust({ error: 'BELOW_HELD', available: 4 }));
      const text = await run('/corregir m500 -9');
      expect(text).toContain('reservadas');
      expect(text).toContain('-4');
    });

    it('reports an unknown lot with a /lotes hint', async () => {
      const { run } = setup(adjust({ error: 'LOT_NOT_FOUND' }));
      const text = await run('/agregar zz9 5');
      expect(text).toContain('Lote no encontrado');
      expect(text).toContain('/lotes');
    });

    it('never shows internals on RPC failure (INVALID_ARGS or others)', async () => {
      const { run } = setup(adjust({ error: 'INVALID_ARGS' }));
      expect(await run('/agregar m500 5')).toBe('No se pudo aplicar, reintenta.');
      const boom = setup({ adjustStock: vi.fn().mockRejectedValue(new Error('pg: secret')) });
      await expect(boom.run('/agregar m500 5')).rejects.toThrow();
    });

    it('bad args answer with usage and never call the DB', async () => {
      const { db, run } = setup(adjust({}));
      expect(await run('/agregar m500 0')).toBe('Uso: /agregar <código> <n>');
      expect(await run('/corregir m500 0')).toBe('Uso: /corregir <código> <±n> [motivo]');
      noDb(db);
    });
  });
});
