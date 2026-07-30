/**
 * Anything that crosses the wire comes from the shared contract, so the client
 * cannot drift from the server's idea of a loot priority or an unlock id.
 * UI-only shapes stay here.
 */
export type {
  Character,
  LootPriority,
  ScreenId,
  SpendPolicy,
  StandingOrders,
  UnlockId,
} from '@deepholdings/shared';
