import { LIST_CAP } from './constants.js';
import { formatAdjustment, formatHelp, formatLots, formatOrder, formatPending } from './format.js';

const HINT = 'Comando no reconocido. Usa /ayuda para ver los comandos.';

// run() resolves to the plain-text reply. Invalid input never reaches the DB.
export function createAdminCommands({ db, now = () => new Date() }) {
  const adjust =
    (kind) =>
    async (args, { adminId, updateId }) =>
      formatAdjustment(args, await db.adjustStock({ ...args, kind, adminId, updateId }));
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
  };
  return {
    async run(cmd, ctx = {}) {
      if (cmd.hint) return HINT;
      if (cmd.usage) return `Uso: ${cmd.usage}`;
      return handlers[cmd.name](cmd.args, ctx);
    },
  };
}
