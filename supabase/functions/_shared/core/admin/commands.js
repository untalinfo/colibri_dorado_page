import { LIST_CAP } from './constants.js';
import {
  formatActiveChange,
  formatAdjustment,
  formatHelp,
  formatLots,
  formatOrder,
  formatPending,
  formatPriceChange,
  formatSummary,
} from './format.js';

const HINT = 'Comando no reconocido. Usa /ayuda para ver los comandos.';

// run() resolves to the plain-text reply. Invalid input never reaches the DB.
export function createAdminCommands({ db, now = () => new Date() }) {
  const adjust =
    (kind) =>
    async (args, { adminId, updateId }) =>
      formatAdjustment(args, await db.adjustStock({ ...args, kind, adminId, updateId }));
  const setActive =
    (value) =>
    async (args, { adminId, updateId }) =>
      formatActiveChange(
        args,
        await db.changeLot({ ...args, kind: 'active', value, adminId, updateId }),
      );
  const handlers = {
    ayuda: async () => formatHelp(),
    lotes: async () => formatLots(await db.lotOverview()),
    pendientes: async () => formatPending(await db.listPending(LIST_CAP), now()),
    pedido: async ({ ref }) => {
      const order = await db.getOrder(ref);
      return order ? formatOrder(order) : 'Pedido no encontrado';
    },
    agregar: adjust('add'),
    corregir: adjust('correct'),
    precio: async ({ code, price }, { adminId, updateId }) =>
      formatPriceChange(
        { code },
        await db.changeLot({ code, kind: 'price', value: price, adminId, updateId }),
      ),
    pausar: setActive(0),
    reanudar: setActive(1),
    resumen: async (args) => formatSummary(args, await db.orderSummary(args.days)),
  };
  return {
    async run(cmd, ctx = {}) {
      if (cmd.hint) return HINT;
      if (cmd.usage) return `Uso: ${cmd.usage}`;
      return handlers[cmd.name](cmd.args, ctx);
    },
  };
}
