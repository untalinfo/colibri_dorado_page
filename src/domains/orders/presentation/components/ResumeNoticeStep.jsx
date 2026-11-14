import { errorMessage } from '../orderMessages';
import ReceivedNotice from './ReceivedNotice';
import StepHeading from './StepHeading';

const PRIMARY =
  'w-full py-3 px-6 rounded-full font-medium text-sm text-sand-50 bg-honey-700 hover:bg-honey-600 border border-honey-600 transition-colors motion-reduce:transition-none';

// Shown when the saved order could not be recovered. The order is kept (retry) unless the
// user explicitly drops it, so a flaky network never silently opens a blank form.
export default function ResumeNoticeStep({ code, onRetry, onRestart, onClose }) {
  if (code === 'INVALID_STATE') return <ReceivedNotice onClose={onClose} />;
  return (
    <div className="mt-8 space-y-4 font-sans text-center text-sand-100">
      <StepHeading>No pudimos recuperar tu reserva</StepHeading>
      <p role="status" className="text-sm text-sand-300">
        {errorMessage(code)}
      </p>
      <button type="button" onClick={onRetry} className={PRIMARY}>
        Reintentar
      </button>
      <button type="button" onClick={onRestart} className="underline text-sm text-honey-300">
        Hacer un pedido nuevo
      </button>
    </div>
  );
}
