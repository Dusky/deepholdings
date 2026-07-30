import { createContext, useContext } from 'react';
import type { StandingOrders, StateResponse, UnlockId } from '@deepholdings/shared';

export type LinkStatus = 'connecting' | 'online' | 'degraded' | 'offline';

export interface ServerState {
  /** Last good snapshot. Kept through a failed refresh so the screen survives. */
  state: StateResponse | null;
  /** Date.now() when that snapshot arrived, for clock offset maths. */
  receivedAt: number;
  link: LinkStatus;
  error: string | null;
  refresh: () => Promise<void>;
  fileOrders: (orders: StandingOrders) => Promise<string>;
  purchaseUnlock: (id: UnlockId) => Promise<void>;
  claimPension: () => Promise<void>;
}

export const ServerContext = createContext<ServerState | null>(null);

export function useServer(): ServerState {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error('useServer must be used inside <ServerProvider>');
  return ctx;
}

/** Narrowed accessor for screens that only render once a snapshot exists. */
export function useSnapshot(): StateResponse {
  const { state } = useServer();
  if (!state) throw new Error('useSnapshot used before the first snapshot arrived');
  return state;
}
