// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { formatCop } from '../notify/format.js';
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

  describe('lot changes and summary', () => {
    const change = (result) => ({ changeLot: vi.fn().mockResolvedValue(result) });
    const cop = (n) => formatCop(n);

    it('/precio confirms old and new price and that orders keep theirs', async () => {
      const { db, run } = setup(change({ changed: true, old: 38000, new: 42000, replayed: false }));
      const text = await run('/precio m500 42.000');
      expect(text).toContain(`Precio m500: ${cop(38000)} → ${cop(42000)}`);
      expect(text).toContain('conservan su precio');
      expect(db.changeLot).toHaveBeenCalledWith({
        code: 'm500',
        kind: 'price',
        value: 42000,
        adminId: '1',
        updateId: 9,
      });
    });

    it('/precio with the same price reports no change', async () => {
      const { run } = setup(change({ changed: false, old: 42000, new: 42000, replayed: false }));
      expect(await run('/precio m500 42000')).toContain('sin cambios');
    });

    it('/pausar and /reanudar report the new state and pass kind active', async () => {
      const paused = setup(change({ changed: true, old: 1, new: 0, replayed: false }));
      expect(await paused.run('/pausar m500')).toBe('Lote m500 pausado.');
      expect(paused.db.changeLot).toHaveBeenCalledWith({
        code: 'm500',
        kind: 'active',
        value: 0,
        adminId: '1',
        updateId: 9,
      });
      const resumed = setup(change({ changed: true, old: 0, new: 1, replayed: false }));
      expect(await resumed.run('/reanudar m500')).toBe('Lote m500 activo.');
      expect(resumed.db.changeLot.mock.calls[0][0].value).toBe(1);
    });

    it('no-ops say the lot already was in that state', async () => {
      const noop = (old) => change({ changed: false, old, new: old, replayed: false });
      expect(await setup(noop(0)).run('/pausar m500')).toBe('Lote m500 ya estaba pausado.');
      expect(await setup(noop(1)).run('/reanudar m500')).toBe('Lote m500 ya estaba activo.');
    });

    it('replays are flagged', async () => {
      const { run } = setup(change({ changed: true, old: 1, new: 0, replayed: true }));
      expect(await run('/pausar m500')).toBe('Ya aplicado antes. Lote m500 pausado.');
    });

    it('unknown lot and failures get fixed replies', async () => {
      expect(await setup(change({ error: 'LOT_NOT_FOUND' })).run('/pausar zz9')).toContain(
        'Lote no encontrado',
      );
      expect(await setup(change({ error: 'INVALID_ARGS' })).run('/precio m500 5000')).toBe(
        'No se pudo aplicar, reintenta.',
      );
    });

    it('bad args answer with usage and never call the DB', async () => {
      const { db, run } = setup(change({}));
      expect(await run('/precio m500 999')).toBe('Uso: /precio <código> <cop>');
      expect(await run('/pausar')).toBe('Uso: /pausar <código>');
      expect(await run('/resumen 99')).toBe('Uso: /resumen [días]');
      noDb(db);
    });

    it('/resumen lists every status with zeros and confirmed revenue only', async () => {
      const rows = [
        { status: 'pending_payment', orders: 0, units: 0, revenue_cop: 0 },
        { status: 'pending_verification', orders: 1, units: 2, revenue_cop: 0 },
        { status: 'confirmed', orders: 3, units: 5, revenue_cop: 190000 },
        { status: 'rejected', orders: 0, units: 0, revenue_cop: 0 },
        { status: 'expired', orders: 2, units: 2, revenue_cop: 0 },
      ];
      const { db, run } = setup({ orderSummary: vi.fn().mockResolvedValue(rows) });
      const text = await run('/resumen');
      expect(db.orderSummary).toHaveBeenCalledWith(7);
      expect(text).toContain('últimos 7 días');
      expect(text).toContain('confirmado: 3 pedidos · 5 uds');
      expect(text).toContain('rechazado: 0 pedidos · 0 uds');
      expect(text).toContain(`Ingresos confirmados: ${cop(190000)}`);
      expect(text.toLowerCase()).not.toContain('nequi');
      await run('/resumen 30');
      expect(db.orderSummary).toHaveBeenLastCalledWith(30);
    });

    it('/resumen with one day uses the singular', async () => {
      const { run } = setup({ orderSummary: vi.fn().mockResolvedValue([]) });
      expect(await run('/resumen 1')).toContain('último día');
    });
  });
});
