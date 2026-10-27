import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HarvestNotificationModal from '../domains/notifications/presentation/components/HarvestNotificationModal';

describe('HarvestNotificationModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(<HarvestNotificationModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders subscription form when isOpen is true', () => {
    render(<HarvestNotificationModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /Alertas de Cosecha/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo electrónico/i)).toBeInTheDocument();
  });

  it('submits form and displays success confirmation', () => {
    render(<HarvestNotificationModal isOpen={true} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Nombre completo/i), {
      target: { value: 'Mateo Gómez' },
    });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: 'mateo@ejemplo.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Suscribirme a las Alertas/i }));

    expect(screen.getByText(/¡Quedaste en la lista, Mateo Gómez!/i)).toBeInTheDocument();
  });
});
