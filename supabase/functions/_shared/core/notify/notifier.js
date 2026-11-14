const RECEIPT_URL_TTL_SECONDS = 300;

// Channels are optional (null = disabled) and isolated: one failing never blocks the other.
// Logs carry the ref and the error class only, never messages (may embed secrets or PII).
export function createNotifier({ telegram, email, signReceiptUrl, log = () => {} }) {
  const fail = (channel, ref) => (err) =>
    log('notify_failed', { channel, ref, error: err?.name ?? 'Error' });

  return {
    async orderSubmitted(order) {
      const run = async (fn) => fn();
      const jobs = [];
      if (telegram) {
        jobs.push(
          run(async () => {
            let url = null;
            try {
              url = await signReceiptUrl(order.receipt_path, RECEIPT_URL_TTL_SECONDS);
            } catch (err) {
              fail('receipt_sign', order.ref)(err);
            }
            await telegram.send(order, url);
          }).catch(fail('telegram', order.ref)),
        );
      }
      if (email) jobs.push(run(() => email.send(order)).catch(fail('email', order.ref)));
      await Promise.all(jobs);
    },
  };
}
