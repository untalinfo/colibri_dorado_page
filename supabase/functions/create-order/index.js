import { createCreateOrderHandler } from '../_shared/core/handlers/createOrder.js';
import { buildDeps } from '../_shared/deps.js';

Deno.serve(createCreateOrderHandler(buildDeps()));
