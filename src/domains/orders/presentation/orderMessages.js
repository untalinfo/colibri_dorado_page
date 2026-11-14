// Spanish copy keyed by ApiError.code. The server `message` is never displayed.
const PLURAL = (n) => (n === 1 ? 'frasco disponible' : 'frascos disponibles');

export function errorMessage(code, extra) {
  switch (code) {
    case 'OUT_OF_STOCK':
      return Number.isFinite(extra?.available) && extra.available > 0
        ? `Solo quedan ${extra.available} ${PLURAL(extra.available)}. Ajusta la cantidad e inténtalo de nuevo.`
        : 'Este lote se agotó. Avísanos y te cuidamos el próximo.';
    case 'RATE_LIMITED':
      return 'Has hecho muchos intentos. Inténtalo de nuevo más tarde.';
    case 'HOLD_EXPIRED':
      return 'Tu reserva venció y los frascos volvieron al lote. Empieza de nuevo.';
    case 'RECEIPT_MISSING':
      return 'No recibimos tu comprobante. Adjúntalo de nuevo e inténtalo otra vez.';
    case 'RECEIPT_INVALID':
      return 'El comprobante debe ser JPG, PNG, WebP o PDF de máximo 5 MB.';
    case 'TIMEOUT':
      return 'La conexión tardó demasiado. Revisa tu internet e inténtalo de nuevo.';
    case 'INVALID_STATE':
      return 'Ya recibimos tu comprobante; te confirmaremos pronto.';
    case 'LOT_UNAVAILABLE':
      return 'Este lote no está disponible por ahora.';
    case 'NOT_FOUND':
      return 'No encontramos ese pedido. Empieza de nuevo.';
    default:
      return 'Algo salió mal. Inténtalo de nuevo en unos minutos.';
  }
}

// Errors after which the hold is gone: the only way out is a fresh start.
// INVALID_STATE is deliberately absent: it means the receipt already arrived.
export const TERMINAL_CODES = ['HOLD_EXPIRED', 'NOT_FOUND'];

const FIELD = {
  required: 'Este campo es obligatorio.',
  too_long: 'Es demasiado largo.',
};
const SPECIFIC = {
  phone: 'Ingresa un celular colombiano de 10 dígitos que empiece por 3.',
  email: 'Ingresa un correo válido.',
  consent: 'Debes aceptar el tratamiento de datos para continuar.',
  qty: 'Elige una cantidad disponible.',
};

export const fieldMessage = (field, reason) => SPECIFIC[field] ?? FIELD[reason] ?? FIELD.required;
