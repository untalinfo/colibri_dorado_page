import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLot } from '../application/getLot';
import { LotContext } from './hooks/useLot';

export default function LotProvider({ repository, children }) {
  const [state, setState] = useState({ status: 'loading', lot: null });

  const generation = useRef(0);

  // Only the latest request may write state; unmount or a repository change invalidates
  // in-flight ones. A failed refresh keeps the last ready lot (stale availability beats none).
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    try {
      const lot = await getLot(repository);
      if (id === generation.current) setState({ status: 'ready', lot });
    } catch {
      if (id === generation.current) {
        setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', lot: null }));
      }
    }
  }, [repository]);

  useEffect(() => {
    refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <LotContext.Provider value={value}>{children}</LotContext.Provider>;
}
