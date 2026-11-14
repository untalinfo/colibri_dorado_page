import { errorMessage } from '../orderMessages';
import StepHeading from './StepHeading';

export default function ReceivedNotice({ onClose }) {
  return (
    <div className="mt-8 space-y-4 font-sans text-center text-sand-100">
      <StepHeading>Tu comprobante ya llegó</StepHeading>
      <p role="status" className="text-sm text-sand-300">
        {errorMessage('INVALID_STATE')}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="w-full py-3 px-6 rounded-full font-medium text-sm text-sand-50 bg-honey-700 hover:bg-honey-600 border border-honey-600 transition-colors motion-reduce:transition-none"
      >
        Cerrar
      </button>
    </div>
  );
}
