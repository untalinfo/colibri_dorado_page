import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Hero from '../domains/landing/presentation/components/Hero';
import LotProvider from '../domains/orders/presentation/LotProvider';

const renderHero = (repository) =>
  render(
    <LotProvider repository={repository}>
      <Hero onOpenNotify={vi.fn()} onOpenOrder={vi.fn()} />
    </LotProvider>,
  );

describe('Hero lot availability', () => {
  it('shows no availability line and no hardcoded number without a provider', () => {
    render(<Hero onOpenNotify={vi.fn()} onOpenOrder={vi.fn()} />);
    expect(screen.queryByText(/frascos? disponibles?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/23/)).not.toBeInTheDocument();
  });

  it('shows the live count when ready', async () => {
    renderHero({ fetchLot: async () => ({ available: 12 }) });
    expect(await screen.findByText(/12 frascos disponibles del lote actual/)).toBeInTheDocument();
  });

  it('uses singular for one jar', async () => {
    renderHero({ fetchLot: async () => ({ available: 1 }) });
    expect(await screen.findByText(/1 frasco disponible del lote actual/)).toBeInTheDocument();
  });

  it('shows sold-out copy at zero', async () => {
    renderHero({ fetchLot: async () => ({ available: 0 }) });
    expect(await screen.findByText(/lote actual agotado/i)).toBeInTheDocument();
  });

  it('renders nothing for the line while loading and on error', async () => {
    renderHero({
      fetchLot: async () => {
        throw new Error('down');
      },
    });
    expect(screen.queryByText(/frascos? disponibles?|agotado/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(screen.queryByText(/frascos? disponibles?|agotado/i)).not.toBeInTheDocument();
  });
});
