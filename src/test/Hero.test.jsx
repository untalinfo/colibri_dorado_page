import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Hero from '../domains/landing/presentation/components/Hero';

describe('Hero Component', () => {
  it('renders brand name and tagline accurately', () => {
    render(<Hero onOpenNotify={vi.fn()} onOpenOrder={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Colibrí Dorado');
    expect(screen.getByText('Miel cruda de bosque andino. Cosecha limitada.')).toBeInTheDocument();
    expect(screen.getByText(/Finca Los Colibríes • Santa Elena, Piendamó/i)).toBeInTheDocument();
  });

  it('triggers onOpenOrder when clicking order button', () => {
    const handleOpenOrder = vi.fn();
    render(<Hero onOpenNotify={vi.fn()} onOpenOrder={handleOpenOrder} />);

    const orderButton = screen.getByRole('button', { name: /Reservar Frasco de Cosecha/i });
    fireEvent.click(orderButton);

    expect(handleOpenOrder).toHaveBeenCalledTimes(1);
  });

  it('triggers onOpenNotify when clicking harvest notification button', () => {
    const handleOpenNotify = vi.fn();
    render(<Hero onOpenNotify={handleOpenNotify} onOpenOrder={vi.fn()} />);

    const notifyButton = screen.getByRole('button', { name: /Avisarme de Próxima Cosecha/i });
    fireEvent.click(notifyButton);

    expect(handleOpenNotify).toHaveBeenCalledTimes(1);
  });

  it('displays the provenance and purity guarantee signals', () => {
    render(<Hero onOpenNotify={vi.fn()} onOpenOrder={vi.fn()} />);

    expect(screen.getByText('100% Pura y Cruda')).toBeInTheDocument();
    expect(screen.getByText('1.750 msnm')).toBeInTheDocument();
    expect(screen.getByText('Apicultura Respetuosa')).toBeInTheDocument();
  });
});
