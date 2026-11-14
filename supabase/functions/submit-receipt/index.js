import { createSubmitReceiptHandler } from '../_shared/core/handlers/submitReceipt.js';
import { buildDeps, buildNotifier, runInBackground } from '../_shared/deps.js';

const deps = buildDeps();
Deno.serve(
  createSubmitReceiptHandler({ ...deps, notifier: buildNotifier(deps.storage), runInBackground }),
);
