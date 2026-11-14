import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLot } from '../domains/orders/presentation/hooks/useLot';
import LotProvider from '../domains/orders/presentation/LotProvider';

function Probe() {
  const { status, lot } = useLot();
  return (
    <p data-testid="p">
      {status}:{lot?.available ?? '-'}
    </p>
  );
}

describe('useLot / LotProvider', () => {
  it('is idle without a provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('p')).toHaveTextContent('idle:-');
  });

  it('goes loading then ready with the fetched lot', async () => {
    const repository = { fetchLot: async () => ({ slug: 's', available: 7 }) };
    render(
      <LotProvider repository={repository}>
        <Probe />
      </LotProvider>,
    );
    expect(screen.getByTestId('p')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('ready:7'));
  });

  it('goes error when the repository fails', async () => {
    const repository = {
      fetchLot: async () => {
        throw new Error('boom');
      },
    };
    render(
      <LotProvider repository={repository}>
        <Probe />
      </LotProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('error'));
  });

  it('ignores a stale response after the repository changes', async () => {
    let resolveOld;
    const oldRepo = { fetchLot: () => new Promise((r) => (resolveOld = r)) };
    const newRepo = { fetchLot: async () => ({ slug: 's', available: 2 }) };
    const { rerender } = render(
      <LotProvider repository={oldRepo}>
        <Probe />
      </LotProvider>,
    );
    rerender(
      <LotProvider repository={newRepo}>
        <Probe />
      </LotProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('ready:2'));
    await act(async () => resolveOld({ slug: 's', available: 99 }));
    expect(screen.getByTestId('p')).toHaveTextContent('ready:2');
  });

  it('keeps the last ready lot when a refresh fails', async () => {
    let fail = false;
    const repository = {
      fetchLot: async () => {
        if (fail) throw new Error('boom');
        return { slug: 's', available: 5 };
      },
    };
    let refresh;
    function Grab() {
      refresh = useLot().refresh;
      return null;
    }
    render(
      <LotProvider repository={repository}>
        <Probe />
        <Grab />
      </LotProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('ready:5'));
    fail = true;
    await act(async () => refresh());
    expect(screen.getByTestId('p')).toHaveTextContent('ready:5');
  });
});
