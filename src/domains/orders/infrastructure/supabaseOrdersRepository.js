import {
  API_TIMEOUT_MS,
  ApiError,
  createFunctionsClient,
  fetchWithTimeout,
  UPLOAD_TIMEOUT_MS,
} from '../../../shared/lib/supabase';

export function createSupabaseOrdersRepository(
  config,
  fetchImpl,
  { timeoutMs = API_TIMEOUT_MS, uploadTimeoutMs = UPLOAD_TIMEOUT_MS } = {},
) {
  const call = createFunctionsClient(config, fetchImpl, { timeoutMs });
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  const receiptAction = (action) => (input) =>
    call('submit-receipt', { body: { ref: input.ref, orderToken: input.orderToken, action } });

  return {
    async fetchLot(slug) {
      const { lot } = await call('get-lot', { query: { slug } });
      if (!lot) throw new ApiError('INVALID_RESPONSE', 200);
      return lot;
    },
    createOrder: (input) => call('create-order', { body: input }),
    submitReceipt: receiptAction('submit'),
    renewUpload: receiptAction('renew'),
    // Signed Storage upload URL: authorised by its own token, no anon headers needed.
    async uploadReceipt(signedUrl, file) {
      const res = await fetchWithTimeout(
        doFetch,
        signedUrl,
        {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        },
        uploadTimeoutMs,
      );
      if (!res.ok) throw new ApiError('UPLOAD_FAILED', res.status);
    },
  };
}
