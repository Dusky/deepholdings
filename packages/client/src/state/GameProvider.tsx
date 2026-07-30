import { useMemo, useReducer, type ReactNode } from 'react';
import { useInterval } from '../hooks/useInterval';
import { GameContext } from './gameContext';
import { gameReducer, initialGameState } from './gameReducer';

/** Prototype cadence for the idle loop — replace with the server's resolved
 *  character state once the world journal is wired up. */
const TICK_MS = 400;
const HEARTBEAT_MS = 1000;

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  useInterval(() => dispatch({ type: 'tick' }), state.isDead ? null : TICK_MS);
  useInterval(() => dispatch({ type: 'heartbeatTick' }), state.isDead ? null : HEARTBEAT_MS);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
