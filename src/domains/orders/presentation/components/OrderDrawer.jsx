import { X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createPendingOrderStore } from '../../infrastructure/pendingOrderStore';
import { useLot } from '../hooks/useLot';
import { useOrderFlow } from '../hooks/useOrderFlow';
import { errorMessage } from '../orderMessages';
import DoneStep from './DoneStep';
import OrderFormStep from './OrderFormStep';
import PaymentStep from './PaymentStep';
import ResumeNoticeStep from './ResumeNoticeStep';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([tabindex="-1"]),select,textarea,[tabindex]:not([tabindex="-1"])';

// Everything outside the portal root stops being reachable while the drawer is open.
function useModalIsolation(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    const siblings = [...document.body.children].filter(
      (el) => el !== root && !el.hasAttribute('inert'),
    );
    for (const el of siblings) el.setAttribute('inert', '');
    return () => {
      for (const el of siblings) el.removeAttribute('inert');
    };
  }, [rootRef]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}

// Escape and the Tab trap live on the document so they keep working when focus falls to <body>
// (e.g. the focused button of a finished step unmounts).
function useDialogKeys(dialogRef, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') return closeRef.current();
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      const items = [...dialog.querySelectorAll(FOCUSABLE)];
      if (!items.length) {
        e.preventDefault();
        return dialog.focus();
      }
      const [first, last] = [items[0], items.at(-1)];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialogRef]);
}

function Panel({ onClose, children }) {
  const rootRef = useRef(null);
  const dialogRef = useRef(null);

  // Declared before the focus effect: on close the background becomes interactive again
  // (cleanups run in order) before focus returns to the opener.
  useModalIsolation(rootRef);
  useDialogKeys(dialogRef, onClose);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-50 overflow-hidden font-sans">
      <button
        type="button"
        aria-label="Cerrar panel de pedido"
        tabIndex={-1}
        className="absolute inset-0 w-full h-full bg-forest-950/80 backdrop-blur-sm cursor-default border-0"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-drawer-title"
          tabIndex={-1}
          className="w-screen max-w-md bg-forest-900 border-l border-moss-700/60 p-6 sm:p-8 overflow-y-auto shadow-2xl focus:outline-none"
        >
          <div className="flex items-center justify-between pb-6 border-b border-moss-700/40">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
              <h2 id="order-drawer-title" className="text-xl font-serif font-normal text-sand-50">
                Reserva de Cosecha
              </h2>
            </div>
            <button
              type="button"
              aria-label="Cerrar panel"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center text-sand-400 hover:text-sand-100 rounded-lg hover:bg-forest-800 transition-colors motion-reduce:transition-none"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const Note = ({ children, role }) => (
  <p role={role} className="mt-8 text-sm text-sand-300 text-center">
    {children}
  </p>
);

function ReservationFlow({ repository, pendingStore, onClose }) {
  const { status, lot, refresh } = useLot();
  const { state, submitForm, sendReceipt, reset, retryResume } = useOrderFlow({
    repository,
    store: pendingStore,
  });
  const message = state.errorCode ? errorMessage(state.errorCode, state.errorExtra) : null;

  // The server says the stock changed: reload the lot so the quantity cap follows.
  useEffect(() => {
    if (state.errorCode === 'OUT_OF_STOCK') refresh();
  }, [state.errorCode, refresh]);

  if (state.step === 'resuming') return <Note role="status">Recuperando tu reserva…</Note>;
  if (state.step === 'resume_error') {
    return (
      <ResumeNoticeStep
        code={state.errorCode}
        onRetry={retryResume}
        onRestart={reset}
        onClose={onClose}
      />
    );
  }
  if (state.step === 'payment') {
    return (
      <PaymentStep
        order={state.order}
        state={state}
        onSubmit={sendReceipt}
        onRestart={reset}
        onClose={onClose}
      />
    );
  }
  if (state.step === 'done') return <DoneStep order={state.order} onClose={onClose} />;

  if (status === 'error') {
    return (
      <div className="mt-8 text-center">
        <Note>No pudimos cargar la disponibilidad del lote.</Note>
        <button type="button" onClick={refresh} className="mt-4 underline text-honey-300">
          Reintentar
        </button>
      </div>
    );
  }
  if (status !== 'ready') return <Note role="status">Cargando el lote…</Note>;
  if (lot.available <= 0) {
    return <Note>El lote actual está agotado. Pronto tendremos nueva cosecha.</Note>;
  }
  return (
    <OrderFormStep lot={lot} state={state} message={message} onSubmit={(v) => submitForm(v, lot)} />
  );
}

export default function OrderDrawer({ isOpen, onClose, repository, pendingStore }) {
  const store = useMemo(() => pendingStore ?? createPendingOrderStore(), [pendingStore]);
  if (!isOpen) return null;

  return (
    <Panel onClose={onClose}>
      {repository ? (
        <ReservationFlow repository={repository} pendingStore={store} onClose={onClose} />
      ) : (
        <Note>
          Las reservas en línea estarán disponibles próximamente. ¡Gracias por tu interés!
        </Note>
      )}
    </Panel>
  );
}
