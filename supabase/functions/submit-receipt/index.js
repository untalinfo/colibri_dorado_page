import { createSubmitReceiptHandler } from '../_shared/core/handlers/submitReceipt.js';
import { buildDeps } from '../_shared/deps.js';

Deno.serve(createSubmitReceiptHandler(buildDeps()));
