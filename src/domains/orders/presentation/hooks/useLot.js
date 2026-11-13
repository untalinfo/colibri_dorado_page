import { createContext, useContext } from 'react';

const IDLE = { status: 'idle', lot: null, refresh: () => {} };

export const LotContext = createContext(IDLE);

// Without a provider (reservations disabled) consumers just see `idle`.
export const useLot = () => useContext(LotContext);
