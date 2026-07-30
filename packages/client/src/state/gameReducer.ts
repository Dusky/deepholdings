import { ACTIVITIES, CASE_OFFICER, TAVERN_MESSAGES, UNLOCKS } from '../data/fixtures';
import { formatClock, toRoman } from '../lib/format';
import type {
  DeathInfo,
  LootPriority,
  ScreenId,
  SpendPolicy,
  TavernMessage,
  Unlock,
  UnlockId,
} from '../types';

export interface GameState {
  activeScreen: ScreenId;
  /** Standing Orders form (spec §4). */
  targetDepth: number;
  retreatPct: number;
  lootPriority: LootPriority;
  spendPolicy: SpendPolicy;
  ordersFiled: boolean;
  filedTime: string;
  /** Resources — server-authoritative in production; ticked locally here. */
  gold: number;
  supplies: number;
  activityIdx: number;
  activityProgress: number;
  /** Seconds to the next world-journal heartbeat (spec §3.2). */
  heartbeatSecs: number;
  tavernMessages: TavernMessage[];
  pensionTotal: number;
  unlocks: Unlock[];
  recruitNum: number;
  isDead: boolean;
  deathInfo: DeathInfo | null;
}

export const HEARTBEAT_PERIOD_SECS = 300;

export const initialGameState: GameState = {
  activeScreen: 'terminal',
  targetDepth: 7,
  retreatPct: 28,
  lootPriority: 'gear',
  spendPolicy: 'resupply',
  ordersFiled: false,
  filedTime: '',
  gold: 214,
  supplies: 12,
  activityIdx: 0,
  activityProgress: 0,
  heartbeatSecs: HEARTBEAT_PERIOD_SECS,
  tavernMessages: [...TAVERN_MESSAGES],
  pensionTotal: 2140,
  unlocks: UNLOCKS.map((u) => ({ ...u })),
  recruitNum: 4,
  isDead: false,
  deathInfo: null,
};

export type GameAction =
  | { type: 'tick' }
  | { type: 'heartbeatTick' }
  | { type: 'goTo'; screen: ScreenId }
  | { type: 'sendTavernMessage'; body: string }
  | { type: 'setTargetDepth'; value: number }
  | { type: 'setRetreatPct'; value: number }
  | { type: 'setLootPriority'; value: LootPriority }
  | { type: 'setSpendPolicy'; value: SpendPolicy }
  | { type: 'fileOrders'; at: Date }
  | { type: 'purchaseUnlock'; id: UnlockId }
  | { type: 'triggerDeath' }
  | { type: 'claimPension' };

export function characterName(recruitNum: number): string {
  return `GRIMWALD ${toRoman(recruitNum)}, THE UNREMARKABLE`;
}

export function isUnlockOwned(state: GameState, id: UnlockId): boolean {
  return state.unlocks.some((u) => u.id === id && u.owned);
}

/** Pension is the meta-currency banked on death (spec's `pensions` table). */
export function pensionAward(gold: number, targetDepth: number): number {
  return Math.round(gold * 1.4 + targetDepth * 60);
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'tick': {
      // Placeholder cadence: in production this reflects real elapsed time
      // toward the next resolvable event, not a client-side timer.
      if (state.isDead) return state;
      let activityIdx = state.activityIdx;
      let activityProgress = state.activityProgress + 4;
      if (activityProgress >= 100) {
        activityProgress = 0;
        activityIdx = (activityIdx + 1) % ACTIVITIES.length;
      }
      const stipend = isUnlockOwned(state, 'stipend') ? 2 : 0;
      return {
        ...state,
        activityIdx,
        activityProgress,
        gold: state.gold + 1 + stipend,
        supplies: Math.max(0, state.supplies - (activityProgress % 20 === 0 ? 1 : 0)),
      };
    }

    case 'heartbeatTick': {
      if (state.isDead) return state;
      return {
        ...state,
        heartbeatSecs: state.heartbeatSecs <= 0 ? HEARTBEAT_PERIOD_SECS : state.heartbeatSecs - 1,
      };
    }

    case 'goTo':
      return state.activeScreen === action.screen ? state : { ...state, activeScreen: action.screen };

    case 'sendTavernMessage': {
      const body = action.body.trim();
      if (!body) return state;
      const nextId = state.tavernMessages.reduce((max, m) => Math.max(max, m.id), 0) + 1;
      return {
        ...state,
        tavernMessages: [...state.tavernMessages, { id: nextId, author: CASE_OFFICER, body }],
      };
    }

    case 'setTargetDepth':
      return { ...state, targetDepth: action.value };

    case 'setRetreatPct':
      return { ...state, retreatPct: action.value };

    case 'setLootPriority':
      return { ...state, lootPriority: action.value };

    case 'setSpendPolicy':
      return { ...state, spendPolicy: action.value };

    case 'fileOrders':
      return { ...state, ordersFiled: true, filedTime: formatClock(action.at) };

    case 'purchaseUnlock': {
      // Client-side demo of the prestige spend; production validates server-side.
      const unlock = state.unlocks.find((u) => u.id === action.id);
      if (!unlock || unlock.owned || state.pensionTotal < unlock.cost) return state;
      return {
        ...state,
        pensionTotal: state.pensionTotal - unlock.cost,
        unlocks: state.unlocks.map((u) => (u.id === action.id ? { ...u, owned: true } : u)),
      };
    }

    case 'triggerDeath': {
      // Demo-only trigger. Death is a server event in production.
      if (state.isDead) return state;
      return {
        ...state,
        isDead: true,
        deathInfo: {
          name: characterName(state.recruitNum),
          cause: 'enthusiasm',
          floor: state.targetDepth,
          gold: state.gold,
          pensionAwarded: pensionAward(state.gold, state.targetDepth),
        },
      };
    }

    case 'claimPension': {
      if (!state.deathInfo) return state;
      return {
        ...state,
        isDead: false,
        pensionTotal: state.pensionTotal + state.deathInfo.pensionAwarded,
        recruitNum: state.recruitNum + 1,
        gold: 50,
        supplies: 12,
        targetDepth: 1,
        activeScreen: 'terminal',
        deathInfo: null,
      };
    }

    default:
      return state;
  }
}
