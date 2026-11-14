import { Copy, MessageCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { formatCOP } from '../../domain/money';
import { safeHttpsUrl, safeWhatsappUrl } from '../../domain/paymentLinks';
import { RECEIPT_MIMES, validateReceiptFile } from '../../domain/receiptFile';
import { errorMessage, TERMINAL_CODES } from '../orderMessages';
import ReceivedNotice from './ReceivedNotice';
import StepHeading from './StepHeading';

const BTN =
  'py-3 px-6 rounded-full font-medium text-sm text-sand-50 bg-honey-700 hover:bg-honey-600 border border-honey-600 disabled:opacity-60 transition-colors motion-reduce:transition-none';

function useRemaining(expiresAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
}

const COPY_FEEDBACK = {
  idle: '',
  ok: 'Número copiado',
  error: 'No pudimos copiar el número. Cópialo manualmente.',
};

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function PaymentStep({ order, state, onSubmit, onRestart, onClose }) {
  const uid = useId();
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const [fileError, setFileError] = useState(null);
  const [copyState, setCopyState] = useState('idle');
  const remaining = useRemaining(order.expiresAt);
  const { payment } = order;
  const qrUrl = safeHttpsUrl(payment.qrUrl);
  const whatsappUrl = safeWhatsappUrl(payment.whatsapp);
  const expired = remaining === 0 || TERMINAL_CODES.includes(state.errorCode);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payment.nequiNumber);
      setCopyState('ok');
    } catch {
      setCopyState('error');
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!validateReceiptFile(fileRef.current).ok) {
      setFileError(errorMessage('RECEIPT_INVALID'));
      return inputRef.current?.focus();
    }
    setFileError(null);
    onSubmit(fileRef.current);
  };
  const alert = fileError ?? (state.errorCode && errorMessage(state.errorCode, state.errorExtra));

  // INVALID_STATE: the receipt is already in, so this is neither an expiry nor a retry case.
  if (state.errorCode === 'INVALID_STATE') return <ReceivedNotice onClose={onClose} />;

  return (
    <div className="mt-6 space-y-5 font-sans text-sand-100">
      <StepHeading>Paga con Nequi</StepHeading>
      <div className="p-4 rounded-2xl bg-forest-950/90 border border-moss-700/60 space-y-3">
        <p className="text-xs text-sand-400">Tu referencia</p>
        <p data-testid="order-ref" className="text-2xl font-serif text-honey-300">
          {order.ref}
        </p>
        <p className="text-sm">
          Total exacto a pagar:{' '}
          {Number.isFinite(order.total) ? (
            <strong className="text-sand-50">{formatCOP(order.total)}</strong>
          ) : (
            'el valor de tu reserva'
          )}
        </p>
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-moss-700/40">
          <div>
            <p className="text-xs text-sand-400">Nequi a nombre de {payment.holder}</p>
            <p className="text-lg font-medium text-sand-50">{payment.nequiNumber}</p>
          </div>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 text-xs px-3 py-2.5 min-h-10 rounded-lg bg-moss-900 border border-moss-700 hover:bg-moss-800"
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            Copiar número
          </button>
        </div>
        {qrUrl && (
          <img
            src={qrUrl}
            alt="Código QR de Nequi"
            className="w-40 h-40 rounded-lg bg-sand-50 p-2"
          />
        )}
        <p className="text-xs text-sand-300">
          Escribe <strong>{order.ref}</strong> en el mensaje de la transferencia para identificar tu
          pago.
        </p>
      </div>

      <p className="text-xs text-sand-300">
        {expired
          ? 'Tu reserva venció.'
          : `Guardamos tus frascos durante ${clock(remaining)} más. Envía el comprobante antes de que termine.`}
      </p>
      <p role="status" className="sr-only">
        {COPY_FEEDBACK[copyState]}
      </p>
      {copyState !== 'idle' && (
        <p
          aria-hidden="true"
          className={`text-xs ${copyState === 'ok' ? 'text-honey-300' : 'text-red-300'}`}
        >
          {COPY_FEEDBACK[copyState]}
        </p>
      )}

      {expired ? (
        <button type="button" onClick={onRestart} disabled={state.busy} className={`${BTN} w-full`}>
          Empezar de nuevo
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label htmlFor={`${uid}-file`} className="block text-xs font-medium text-sand-300">
            Comprobante de pago (JPG, PNG, WebP o PDF, máx. 5 MB)
          </label>
          <input
            id={`${uid}-file`}
            ref={inputRef}
            type="file"
            accept={RECEIPT_MIMES.join(',')}
            onChange={(e) => {
              fileRef.current = e.target.files?.[0] ?? null;
              setFileError(null);
            }}
            aria-invalid={fileError ? 'true' : undefined}
            aria-describedby={alert ? `${uid}-file-error` : undefined}
            className="block w-full text-xs text-sand-300 file:mr-3 file:rounded-lg file:border-0 file:bg-moss-800 file:px-3 file:py-2 file:text-sand-100"
          />
          {alert && (
            <p id={`${uid}-file-error`} role="alert" className="text-sm text-red-300">
              {alert}
            </p>
          )}
          <button type="submit" disabled={state.busy} className={`${BTN} w-full`}>
            {state.busy ? 'Enviando…' : 'Enviar comprobante'}
          </button>
        </form>
      )}
      {expired && alert && (
        <p role="alert" className="text-sm text-red-300">
          {alert}
        </p>
      )}

      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-xs text-sand-300 hover:text-sand-50"
        >
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
          ¿Dudas? Escríbenos por WhatsApp
        </a>
      )}
    </div>
  );
}
