import StepHeading from './StepHeading';

export default function DoneStep({ order, onClose }) {
  return (
    <div className="mt-8 space-y-4 font-sans text-center text-sand-100">
      <p className="text-3xl" aria-hidden="true">
        🍯
      </p>
      <StepHeading>¡Recibimos tu comprobante!</StepHeading>
      <p className="text-sm text-sand-300">
        Tu referencia es <strong className="text-honey-300">{order.ref}</strong>. Verificamos el
        pago y te contactamos por WhatsApp muy pronto para coordinar la entrega.
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
