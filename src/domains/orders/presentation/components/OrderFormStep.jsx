import { Truck } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { formatCOP } from '../../domain/money';
import { FIELD_BORDER } from '../fieldStyles';
import { fieldMessage } from '../orderMessages';
import StepHeading from './StepHeading';

const INPUT = `w-full px-4 py-2.5 rounded-xl bg-forest-950 border ${FIELD_BORDER.className} text-sand-50 placeholder-sand-500 text-sm focus:outline-none focus:border-honey-500 transition-colors motion-reduce:transition-none aria-[invalid=true]:border-red-400`;
const STEP = `w-10 h-10 rounded-lg bg-moss-900 border ${FIELD_BORDER.className} text-sand-100 font-bold flex items-center justify-center hover:bg-moss-800 transition-colors motion-reduce:transition-none disabled:opacity-40`;

const FIELD_ORDER = ['name', 'phone', 'address', 'email', 'consent'];
const FIELD_LABEL = {
  name: 'Nombre completo',
  phone: 'Celular',
  address: 'Dirección de entrega',
  email: 'Correo electrónico',
  consent: 'Autorización de datos',
  qty: 'Cantidad',
};

function Field({ id, label, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-sand-300 mb-1.5">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-sand-400">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

export default function OrderFormStep({ lot, state, message, onSubmit }) {
  const uid = useId();
  const [values, setValues] = useState({
    name: '',
    phone: '',
    address: '',
    email: '',
    qty: 1,
    consent: false,
    website: '',
  });
  const set = (key) => (e) =>
    setValues((v) => ({
      ...v,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));
  const max = Math.max(1, Math.min(lot.maxPerOrder, lot.available));
  const qty = Math.min(values.qty, max);
  const err = (field) => state.fieldErrors[field] && fieldMessage(field, state.fieldErrors[field]);
  const bind = (field, id) => ({
    id,
    value: values[field],
    onChange: set(field),
    className: INPUT,
    'aria-invalid': err(field) ? 'true' : undefined,
    'aria-describedby': err(field) ? `${id}-error` : undefined,
  });
  const ids = useMemo(() => Object.fromEntries(FIELD_ORDER.map((k) => [k, `${uid}-${k}`])), [uid]);
  const invalid = Object.keys(state.fieldErrors);

  // A failed submit sends the user to the first invalid field; its error is linked by
  // aria-describedby, and the summary below is announced for everything else.
  useEffect(() => {
    const first = FIELD_ORDER.find((field) => state.fieldErrors[field]);
    if (first) document.getElementById(ids[first])?.focus();
  }, [state.fieldErrors, ids]);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...values, qty });
      }}
      className="mt-6 space-y-4 font-sans"
    >
      <StepHeading>Tus datos de entrega</StepHeading>
      {invalid.length > 0 && (
        <p role="alert" className="sr-only">
          Revisa estos campos: {invalid.map((field) => FIELD_LABEL[field] ?? field).join(', ')}.
        </p>
      )}
      <div className="flex items-center justify-between p-4 rounded-xl bg-forest-950/50 border border-moss-700/40">
        <span className="text-xs font-medium text-sand-300">Cantidad de frascos:</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Disminuir cantidad"
            disabled={qty <= 1}
            onClick={() => setValues((v) => ({ ...v, qty: Math.max(1, qty - 1) }))}
            className={STEP}
          >
            -
          </button>
          <output data-testid="qty" className="text-sm font-medium text-sand-50 w-6 text-center">
            {qty}
          </output>
          <button
            type="button"
            aria-label="Aumentar cantidad"
            disabled={qty >= max}
            onClick={() => setValues((v) => ({ ...v, qty: Math.min(max, qty + 1) }))}
            className={STEP}
          >
            +
          </button>
        </div>
      </div>

      <Field id={ids.name} label="Nombre completo" error={err('name')}>
        <input
          {...bind('name', ids.name)}
          type="text"
          autoComplete="name"
          placeholder="Ej. Juan Pérez"
        />
      </Field>
      <Field id={ids.phone} label="Celular" error={err('phone')} hint="10 dígitos, sin indicativo.">
        <input
          {...bind('phone', ids.phone)}
          type="tel"
          autoComplete="tel-national"
          inputMode="tel"
          placeholder="300 123 4567"
        />
      </Field>
      <Field id={ids.address} label="Dirección de entrega (incluye ciudad)" error={err('address')}>
        <input
          {...bind('address', ids.address)}
          type="text"
          autoComplete="street-address"
          placeholder="Calle 1 # 2-3, Popayán"
        />
      </Field>
      <Field id={ids.email} label="Correo electrónico (opcional)" error={err('email')}>
        <input
          {...bind('email', ids.email)}
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
        />
      </Field>

      {/* Honeypot: invisible to people, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No completar
          <input
            type="text"
            name="hp_extra"
            id="hp_extra"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={set('website')}
          />
        </label>
      </div>

      <div>
        <div className="flex items-start gap-2.5">
          <input
            id={ids.consent}
            type="checkbox"
            checked={values.consent}
            onChange={set('consent')}
            aria-invalid={err('consent') ? 'true' : undefined}
            aria-describedby={err('consent') ? `${ids.consent}-error` : undefined}
            className="mt-0.5 h-4 w-4 accent-honey-500"
          />
          <label htmlFor={ids.consent} className="text-xs text-sand-300 leading-relaxed">
            Acepto el tratamiento de mis datos personales según la Ley 1581 de 2012 y la{' '}
            <a
              href="#politica-de-privacidad"
              className="underline text-honey-300 hover:text-honey-200"
            >
              política de privacidad
            </a>
            .
          </label>
        </div>
        {err('consent') && (
          <p id={`${ids.consent}-error`} className="mt-1 text-xs text-red-300">
            {err('consent')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-sand-400">
        <Truck className="w-4 h-4 text-moss-700" aria-hidden="true" />
        <span>Envíos seguros directos desde Piendamó</span>
      </div>

      {state.errorCode && (
        <p role="alert" className="text-sm text-red-300">
          {message}
        </p>
      )}

      <div className="pt-6 border-t border-moss-700/40">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-sand-300 font-medium">Total de la cosecha:</span>
          <span data-testid="total" className="text-xl font-serif font-medium text-sand-50">
            {formatCOP(lot.priceCop * qty)} COP
          </span>
        </div>
        <button
          type="submit"
          disabled={state.busy}
          className="w-full py-3 px-6 rounded-full font-medium text-sm text-sand-50 bg-honey-700 hover:bg-honey-600 border border-honey-600 shadow-sm disabled:opacity-60 transition-colors motion-reduce:transition-none"
        >
          {state.busy ? 'Reservando…' : 'Reservar mi pedido'}
        </button>
      </div>
    </form>
  );
}
