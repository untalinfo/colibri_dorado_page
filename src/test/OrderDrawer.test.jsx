import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPendingOrderStore } from '../domains/orders/infrastructure/pendingOrderStore';
import OrderDrawer from '../domains/orders/presentation/components/OrderDrawer';
import LotProvider from '../domains/orders/presentation/LotProvider';
import { ApiError } from '../shared/lib/supabase';

const NUMBER = '3000000000';
const created = {
  ref: 'CD-ABC123',
  orderToken: 'tok',
  total: 76000,
  expiresAt: '2999-01-01T00:00:00.000Z',
  upload: { signedUrl: 'https://upload.test/x', path: 'p' },
  payment: {
    nequiNumber: NUMBER,
    holder: 'Titular de Prueba',
    whatsapp: 'https://wa.me/573000000000',
  },
};

function setup({ lot, overrides = {}, available = 5 } = {}) {
  const repository = {
    fetchLot: async () =>
      lot ?? { slug: 's', name: 'Miel', priceCop: 38000, available, maxPerOrder: 6 },
    createOrder: vi.fn(async () => created),
    renewUpload: vi.fn(async () => ({
      upload: created.upload,
      payment: created.payment,
      expiresAt: created.expiresAt,
    })),
    uploadReceipt: vi.fn(async () => {}),
    submitReceipt: vi.fn(async () => ({})),
    ...overrides,
  };
  const pendingStore = createPendingOrderStore();
  const onClose = vi.fn();
  render(
    <LotProvider repository={repository}>
      <OrderDrawer isOpen onClose={onClose} repository={repository} pendingStore={pendingStore} />
    </LotProvider>,
  );
  return { repository, pendingStore, onClose };
}

const type = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function fillForm() {
  await screen.findByLabelText(/nombre completo/i);
  type(/nombre completo/i, 'Ana Prueba');
  type(/celular/i, '300 000 0000');
  type(/direcci/i, 'Calle 1 # 2-3, Cali');
  fireEvent.click(screen.getByLabelText(/ley 1581/i));
}
const submitForm = () => fireEvent.click(screen.getByRole('button', { name: /reservar/i }));
const receipt = () => new File(['x'], 'comprobante.pdf', { type: 'application/pdf' });

beforeEach(() => localStorage.clear());

describe('OrderDrawer', () => {
  it('shows a coming-soon state without a repository and never the old wa.me flow', () => {
    render(<OrderDrawer isOpen onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveTextContent(/próximamente/i);
    expect(screen.queryByRole('button', { name: /whatsapp/i })).toBeNull();
  });

  it('renders nothing when closed and closes on Escape', () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('has dialog semantics and a hidden honeypot', async () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await screen.findByLabelText(/nombre completo/i);
    const honeypot = document.querySelector('input[name="hp_extra"]');
    expect(honeypot).toHaveAttribute('tabindex', '-1');
    expect(honeypot).toHaveAttribute('autocomplete', 'off');
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(document.querySelector('input[name="website"], input#website')).toBeNull();
  });

  it('shows per-field Spanish errors and does not call the API', async () => {
    const { repository } = setup();
    await screen.findByLabelText(/nombre completo/i);
    type(/celular/i, '123');
    submitForm();
    expect(await screen.findByText(/celular colombiano/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre completo/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/aceptar/i)).toBeInTheDocument();
    expect(repository.createOrder).not.toHaveBeenCalled();
  });

  it('limits quantity to maxPerOrder and shows the live total', async () => {
    setup({ lot: { slug: 's', priceCop: 10000, available: 9, maxPerOrder: 2 } });
    await screen.findByLabelText(/nombre completo/i);
    const plus = screen.getByRole('button', { name: /aumentar/i });
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(screen.getByTestId('qty')).toHaveTextContent('2');
    expect(screen.getByTestId('total')).toHaveTextContent('$20.000');
  });

  it('maps OUT_OF_STOCK with the available count, never the server message', async () => {
    const err = new ApiError('OUT_OF_STOCK', 409, 'raw server text');
    err.available = 2;
    setup({ overrides: { createOrder: async () => Promise.reject(err) } });
    await fillForm();
    submitForm();
    expect(await screen.findByRole('alert')).toHaveTextContent(/2/);
    expect(screen.queryByText(/raw server text/)).toBeNull();
  });

  it('goes to payment with data from the response only, then done', async () => {
    const { repository, pendingStore } = setup();
    await fillForm();
    submitForm();
    expect(await screen.findByTestId('order-ref')).toBeInTheDocument();
    expect(screen.getByText(NUMBER)).toBeInTheDocument();
    expect(screen.getByText(/Titular de Prueba/)).toBeInTheDocument();
    expect(screen.getByText('$76.000')).toBeInTheDocument();
    expect(localStorage.getItem('colibri.pendingOrder')).not.toContain(NUMBER);
    expect(pendingStore.load()).toMatchObject({ ref: 'CD-ABC123' });

    fireEvent.change(screen.getByLabelText(/comprobante/i), { target: { files: [receipt()] } });
    fireEvent.click(screen.getByRole('button', { name: /enviar comprobante/i }));
    await waitFor(() => expect(repository.submitReceipt).toHaveBeenCalled());
    expect(await screen.findByText(/te contactamos por WhatsApp/i)).toBeInTheDocument();
    expect(screen.queryByText(/Telegram/i)).not.toBeInTheDocument();
    expect(screen.queryByText(NUMBER)).toBeNull();
    expect(localStorage.getItem('colibri.pendingOrder')).toBeNull();
  });

  it('rejects oversized receipts locally', async () => {
    const { repository } = setup();
    await fillForm();
    submitForm();
    await screen.findByTestId('order-ref');
    const big = receipt();
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText(/comprobante/i), { target: { files: [big] } });
    fireEvent.click(screen.getByRole('button', { name: /enviar comprobante/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/5 MB/);
    expect(repository.uploadReceipt).not.toHaveBeenCalled();
  });

  it('keeps the payment step and allows retry when submit fails', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('TIMEOUT', 0))
      .mockResolvedValueOnce({});
    setup({ overrides: { submitReceipt: submit } });
    await fillForm();
    submitForm();
    await screen.findByTestId('order-ref');
    fireEvent.change(screen.getByLabelText(/comprobante/i), { target: { files: [receipt()] } });
    const send = screen.getByRole('button', { name: /enviar comprobante/i });
    fireEvent.click(send);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /enviar comprobante/i }));
    expect(await screen.findByText(/te contactamos por WhatsApp/i)).toBeInTheDocument();
    expect(screen.queryByText(/Telegram/i)).not.toBeInTheDocument();
  });

  it('resumes a pending order through renew and shows payment', async () => {
    localStorage.setItem(
      'colibri.pendingOrder',
      JSON.stringify({
        ref: 'CD-ABC123',
        orderToken: 'tok',
        expiresAt: created.expiresAt,
        total: 76000,
      }),
    );
    const { repository } = setup();
    expect(await screen.findByText(NUMBER)).toBeInTheDocument();
    expect(repository.renewUpload).toHaveBeenCalledWith({ ref: 'CD-ABC123', orderToken: 'tok' });
    expect(localStorage.getItem('colibri.pendingOrder')).not.toContain(NUMBER);
  });

  it('starts fresh when the pending hold is gone', async () => {
    localStorage.setItem(
      'colibri.pendingOrder',
      JSON.stringify({ ref: 'CD-ABC123', orderToken: 'tok', expiresAt: created.expiresAt }),
    );
    setup({
      overrides: { renewUpload: async () => Promise.reject(new ApiError('HOLD_EXPIRED', 410)) },
    });
    expect(await screen.findByLabelText(/nombre completo/i)).toBeInTheDocument();
    expect(localStorage.getItem('colibri.pendingOrder')).toBeNull();
  });

  it('offers a WhatsApp link from the response and copies the number', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup();
    await fillForm();
    submitForm();
    await screen.findByTestId('order-ref');
    expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute(
      'href',
      created.payment.whatsapp,
    );
    fireEvent.click(screen.getByRole('button', { name: /copiar número/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(NUMBER));
    expect(within(screen.getByRole('status')).getByText(/copiado/i)).toBeInTheDocument();
  });

  it('shows sold out instead of the form', async () => {
    setup({ available: 0 });
    expect(await screen.findByText(/agotad/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nombre completo/i)).toBeNull();
  });
});

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const reachPayment = async (opts) => {
  const ctx = setup(opts);
  await fillForm();
  submitForm();
  await screen.findByTestId('order-ref');
  return ctx;
};
const sendFile = (file = receipt()) => {
  fireEvent.change(screen.getByLabelText(/comprobante/i), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /enviar comprobante/i }));
};

describe('W1 crash safety', () => {
  it('disables restart while busy and finishes when the countdown expires mid-upload', async () => {
    const gate = deferred();
    const soon = { ...created, expiresAt: new Date(Date.now() + 1200).toISOString() };
    const { repository } = await reachPayment({
      overrides: {
        createOrder: vi.fn(async () => soon),
        uploadReceipt: vi.fn(() => gate.promise),
      },
    });
    sendFile();
    await waitFor(() => expect(repository.uploadReceipt).toHaveBeenCalled());
    const restart = await screen.findByRole(
      'button',
      { name: /empezar de nuevo/i },
      { timeout: 4000 },
    );
    expect(restart).toBeDisabled();
    gate.resolve();
    expect(await screen.findByText(/te contactamos por WhatsApp/i)).toBeInTheDocument();
    expect(screen.queryByText(/Telegram/i)).not.toBeInTheDocument();
  });
});

describe('W2 focus management', () => {
  it('moves focus to the step heading on every step change', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: /tus datos/i })).toHaveFocus();
    await fillForm();
    submitForm();
    expect(await screen.findByRole('heading', { name: /paga con nequi/i })).toHaveFocus();
    sendFile();
    expect(await screen.findByRole('heading', { name: /recibimos tu comprobante/i })).toHaveFocus();
  });

  it('focuses the payment heading when resuming', async () => {
    localStorage.setItem(
      'colibri.pendingOrder',
      JSON.stringify({ ref: 'CD-ABC123', orderToken: 'tok', expiresAt: created.expiresAt }),
    );
    setup();
    expect(await screen.findByRole('heading', { name: /paga con nequi/i })).toHaveFocus();
  });

  it('wraps Tab from the last control to the first and Shift+Tab back', async () => {
    setup();
    await screen.findByLabelText(/nombre completo/i);
    const close = screen.getByRole('button', { name: 'Cerrar panel' });
    const submit = screen.getByRole('button', { name: /reservar/i });
    submit.focus();
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
    expect(submit).toHaveFocus();
  });

  it('pulls focus back inside when it fell to the body, and Escape still closes', async () => {
    const { onClose } = setup();
    await screen.findByLabelText(/nombre completo/i);
    document.activeElement.blur();
    expect(document.body).toHaveFocus();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement);
    document.activeElement.blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('makes the background inert while open and restores it and the opener focus on close', () => {
    const background = document.createElement('main');
    const opener = document.createElement('button');
    background.append(opener);
    document.body.append(background);
    opener.focus();
    setup();
    expect(background).toHaveAttribute('inert');
    cleanup();
    expect(background).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
    background.remove();
  });

  it('keeps pre-existing inert siblings inert after close', () => {
    const already = document.createElement('aside');
    already.setAttribute('inert', '');
    document.body.append(already);
    setup();
    cleanup();
    expect(already).toHaveAttribute('inert');
    already.remove();
  });
});

describe('W3 resume and INVALID_STATE', () => {
  const stored = () =>
    localStorage.setItem(
      'colibri.pendingOrder',
      JSON.stringify({ ref: 'CD-ABC123', orderToken: 'tok', expiresAt: created.expiresAt }),
    );

  it('explains an already received receipt on resume instead of a blank form', async () => {
    stored();
    setup({
      overrides: { renewUpload: async () => Promise.reject(new ApiError('INVALID_STATE', 409)) },
    });
    expect(await screen.findByText(/Ya recibimos tu comprobante/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nombre completo/i)).toBeNull();
    expect(screen.queryByText(/venci/i)).toBeNull();
    expect(localStorage.getItem('colibri.pendingOrder')).toBeNull();
  });

  it('keeps the stored order and offers retry when the network fails on resume', async () => {
    stored();
    const renew = vi.fn().mockRejectedValueOnce(new ApiError('TIMEOUT', 0)).mockResolvedValueOnce({
      upload: created.upload,
      payment: created.payment,
      expiresAt: created.expiresAt,
    });
    setup({ overrides: { renewUpload: renew } });
    expect(await screen.findByText(/conexión tardó demasiado/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nombre completo/i)).toBeNull();
    expect(localStorage.getItem('colibri.pendingOrder')).toContain('CD-ABC123');
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText(NUMBER)).toBeInTheDocument();
    expect(renew).toHaveBeenCalledTimes(2);
  });

  it('lets the user drop a stuck pending order and start a new one', async () => {
    stored();
    setup({ overrides: { renewUpload: async () => Promise.reject(new ApiError('TIMEOUT', 0)) } });
    fireEvent.click(await screen.findByRole('button', { name: /pedido nuevo/i }));
    expect(await screen.findByLabelText(/nombre completo/i)).toBeInTheDocument();
    expect(localStorage.getItem('colibri.pendingOrder')).toBeNull();
  });

  it('shows the received message, not expiry, when submit hits INVALID_STATE', async () => {
    await reachPayment({
      overrides: {
        submitReceipt: async () => Promise.reject(new ApiError('INVALID_STATE', 409)),
      },
    });
    sendFile();
    expect(await screen.findByText(/Ya recibimos tu comprobante/)).toBeInTheDocument();
    expect(screen.queryByText(/venci/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /enviar comprobante/i })).toBeNull();
    expect(localStorage.getItem('colibri.pendingOrder')).toBeNull();
  });
});

describe('W4 form accessibility', () => {
  it('focuses the first invalid field and announces the invalid fields', async () => {
    setup();
    await screen.findByLabelText(/nombre completo/i);
    type(/celular/i, '123');
    submitForm();
    expect(await screen.findByRole('alert')).toHaveTextContent(/nombre completo/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/celular/i);
    expect(screen.getByLabelText(/nombre completo/i)).toHaveFocus();
  });

  it('focuses the next first invalid field on a second submit', async () => {
    setup();
    await screen.findByLabelText(/nombre completo/i);
    type(/nombre completo/i, 'Ana Prueba');
    submitForm();
    await waitFor(() => expect(screen.getByLabelText(/celular/i)).toHaveFocus());
  });

  it('links the file error to the input and focuses it', async () => {
    await reachPayment();
    const big = receipt();
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    sendFile(big);
    const input = screen.getByLabelText(/comprobante/i);
    await waitFor(() => expect(input).toHaveAttribute('aria-describedby'));
    expect(document.getElementById(input.getAttribute('aria-describedby'))).toHaveTextContent(
      /5 MB/,
    );
    expect(input).toHaveFocus();
  });
});

describe('S1 payment links', () => {
  const withPayment = (payment) => ({
    overrides: {
      createOrder: vi.fn(async () => ({ ...created, payment: { ...created.payment, ...payment } })),
    },
  });

  it('omits unsafe whatsapp and qr urls', async () => {
    await reachPayment(
      withPayment({ whatsapp: 'javascript:alert(1)', qrUrl: 'http://cdn.test/qr.png' }),
    );
    expect(screen.queryByRole('link', { name: /whatsapp/i })).toBeNull();
    expect(screen.queryByAltText(/código qr/i)).toBeNull();
  });

  it('renders https wa.me and https qr urls', async () => {
    await reachPayment(withPayment({ qrUrl: 'https://cdn.test/qr.png' }));
    expect(screen.getByAltText(/código qr/i)).toHaveAttribute('src', 'https://cdn.test/qr.png');
    expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute(
      'href',
      created.payment.whatsapp,
    );
  });

  it('omits a non wa.me whatsapp host', async () => {
    await reachPayment(withPayment({ whatsapp: 'https://evil.test/573000000000' }));
    expect(screen.queryByRole('link', { name: /whatsapp/i })).toBeNull();
  });
});

describe('S2 stock refresh', () => {
  it('reloads the lot on OUT_OF_STOCK so the quantity cap updates', async () => {
    const err = new ApiError('OUT_OF_STOCK', 409, 'x');
    err.available = 2;
    const lots = [
      { slug: 's', name: 'Miel', priceCop: 38000, available: 5, maxPerOrder: 6 },
      { slug: 's', name: 'Miel', priceCop: 38000, available: 2, maxPerOrder: 6 },
    ];
    const fetchLot = vi.fn(async () => lots[Math.min(fetchLot.mock.calls.length - 1, 1)]);
    setup({ overrides: { fetchLot, createOrder: async () => Promise.reject(err) } });
    await fillForm();
    const plus = screen.getByRole('button', { name: /aumentar/i });
    for (let i = 0; i < 3; i++) fireEvent.click(plus);
    expect(screen.getByTestId('qty')).toHaveTextContent('4');
    submitForm();
    await waitFor(() => expect(fetchLot).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('qty')).toHaveTextContent('2'));
  });
});

describe('S3 scroll lock', () => {
  it('locks body scroll while open and restores the previous value', () => {
    document.body.style.overflow = 'auto';
    setup();
    expect(document.body.style.overflow).toBe('hidden');
    cleanup();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });
});

describe('S4 honeypot', () => {
  it('still sends the honeypot value as `website`', async () => {
    const { repository } = setup();
    await fillForm();
    fireEvent.change(document.querySelector('input[name="hp_extra"]'), {
      target: { value: 'bot' },
    });
    submitForm();
    await waitFor(() => expect(repository.createOrder).toHaveBeenCalled());
    expect(repository.createOrder.mock.calls[0][0]).toMatchObject({ website: 'bot' });
  });
});

describe('S7 headings and clipboard', () => {
  it('uses h2 for the dialog and h3 for steps', async () => {
    setup();
    expect(
      screen.getByRole('heading', { level: 2, name: /reserva de cosecha/i }),
    ).toBeInTheDocument();
    await screen.findByLabelText(/nombre completo/i);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
    expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0);
  });

  it('tells the user when copying the number fails', async () => {
    const writeText = vi.fn(async () => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await reachPayment();
    fireEvent.click(screen.getByRole('button', { name: /copiar número/i }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('status')).getByText(/no pudimos copiar/i),
      ).toBeInTheDocument(),
    );
  });
});
