import { createGetLotHandler } from '../_shared/core/handlers/getLot.js';
import { buildDeps } from '../_shared/deps.js';

const { db, config } = buildDeps();
Deno.serve(createGetLotHandler({ db, config }));
