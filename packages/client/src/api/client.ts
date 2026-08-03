import type {
  AdvanceTimeResponse,
  ApiError,
  BulkSellRequest,
  BulkSellResponse,
  BulletinResponse,
  ClaimPensionResponse,
  CommendationId,
  DeviceAuthResponse,
  JournalResponse,
  LedgerResponse,
  PurchaseRequisitionResponse,
  PurchaseUnlockResponse,
  FileFormRequest,
  FileFormResponse,
  RegistryResponse,
  RequisitionId,
  StaffRole,
  SellItemResponse,
  SendTavernMessageResponse,
  StandingOrders,
  StateResponse,
  TavernResponse,
  TransferResponse,
  UnlockId,
  UpdateOrdersResponse,
} from '@deepholdings/shared';
import { resolveBaseUrl, type OverrideStorage } from './baseUrl';
import { randomId } from './deviceId';

/** Chrome throws on the property itself when storage is blocked, not just on use. */
function browserStorage(): OverrideStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const BASE_URL = resolveBaseUrl({
  configured: import.meta.env.VITE_API_URL ?? 'http://localhost:8787',
  dev: import.meta.env.DEV,
  search: window.location.search,
  storage: browserStorage(),
});

const DEVICE_KEY = 'deepholdings.deviceId';
const TOKEN_KEY = 'deepholdings.token';

export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiError['error']['code'] | 'network',
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode: the session still works, it just re-authenticates on reload.
  }
}

/** Stable per-install id. Replaced by a real sign-in before anything is purchasable. */
function deviceId(): string {
  const existing = readStored(DEVICE_KEY);
  if (existing) return existing;
  // Not crypto.randomUUID directly: it is secure-context only, and the
  // documented phone-testing path loads the client over plain http from a LAN
  // address. See api/deviceId.ts.
  const created = randomId();
  writeStored(DEVICE_KEY, created);
  return created;
}

/**
 * Thin API client: holds the device token, retries once through a fresh
 * sign-in when the server rejects it, and turns error bodies into typed
 * failures the UI can render in voice.
 */
export class ApiClient {
  private token: string | null = readStored(TOKEN_KEY);
  private authInFlight: Promise<string> | null = null;

  private async authenticate(): Promise<string> {
    this.authInFlight ??= (async () => {
      const response = await this.send<DeviceAuthResponse>(
        'POST',
        '/v1/auth/device',
        { deviceId: deviceId() },
        null,
      );
      this.token = response.token;
      writeStored(TOKEN_KEY, response.token);
      return response.token;
    })().finally(() => {
      this.authInFlight = null;
    });
    return this.authInFlight;
  }

  private async send<T>(
    method: string,
    path: string,
    body: unknown,
    token: string | null,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new ApiRequestError('network', `link to the Authority is down (${BASE_URL})`, 0);
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ApiError | null;
      throw new ApiRequestError(
        payload?.error.code ?? 'internal',
        payload?.error.message ?? response.statusText,
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  /** Authenticated request; a 401 means the token died, so sign in and retry once. */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.token ?? (await this.authenticate());
    try {
      return await this.send<T>(method, path, body, token);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        this.token = null;
        return this.send<T>(method, path, body, await this.authenticate());
      }
      throw error;
    }
  }

  getState(): Promise<StateResponse> {
    return this.request('GET', '/v1/state');
  }

  updateOrders(orders: StandingOrders): Promise<UpdateOrdersResponse> {
    return this.request('PUT', '/v1/orders', { orders });
  }

  registerPush(token: string, platform: string): Promise<{ registered: boolean }> {
    return this.request('POST', '/v1/push/register', { token, platform });
  }

  unregisterPush(token: string): Promise<{ registered: boolean }> {
    return this.request('POST', '/v1/push/unregister', { token });
  }

  getLedger(): Promise<LedgerResponse> {
    return this.request('GET', '/v1/ledger');
  }

  sellItem(name: string, quantity?: number): Promise<SellItemResponse> {
    return this.request('POST', '/v1/ledger/sell', { name, quantity });
  }

  bulkSell(selector: BulkSellRequest): Promise<BulkSellResponse> {
    return this.request('POST', '/v1/ledger/sell-bulk', selector);
  }

  purchaseRequisition(id: RequisitionId): Promise<PurchaseRequisitionResponse> {
    return this.request('POST', '/v1/office/requisitions', { id });
  }

  purchaseUnlock(id: UnlockId): Promise<PurchaseUnlockResponse> {
    return this.request('POST', '/v1/pension/unlocks', { id });
  }

  /** Form 12-C. The fee leaves the purse here, whatever the panel rules. */
  fileForm(request: FileFormRequest): Promise<FileFormResponse> {
    return this.request('POST', '/v1/armoury/file', request);
  }

  hireStaff(role: StaffRole): Promise<RegistryResponse> {
    return this.request('POST', '/v1/registry/hire', { role });
  }

  /** Amending a standing instruction. Free — it is a form, not a purchase. */
  setStaffPolicy(role: StaffRole, policy: number): Promise<RegistryResponse> {
    return this.request('PUT', '/v1/registry/policy', { role, policy });
  }

  claimPension(): Promise<ClaimPensionResponse> {
    return this.request('POST', '/v1/pension/claim', {});
  }

  /** Form T-1. Surrenders the pension; the department comes with you. */
  fileTransfer(): Promise<TransferResponse> {
    return this.request('POST', '/v1/career/transfer', {});
  }

  purchaseCommendation(id: CommendationId): Promise<TransferResponse> {
    return this.request('POST', '/v1/transfer/commendations', { id });
  }

  retireRecruit(): Promise<ClaimPensionResponse> {
    return this.request('POST', '/v1/recruit/retire', {});
  }

  /** Older journal lines, oldest first. `before` is the oldest id on screen. */
  getJournalBefore(before: string): Promise<JournalResponse> {
    return this.request('GET', `/v1/journal?before=${encodeURIComponent(before)}`);
  }

  /** Development only. The route does not exist unless the server enabled it. */
  advanceTime(hours: number): Promise<AdvanceTimeResponse> {
    return this.request('POST', '/v1/dev/advance', { hours });
  }

  getBulletin(): Promise<BulletinResponse> {
    return this.send('GET', '/v1/bulletin', undefined, null);
  }

  getTavern(sinceId = 0): Promise<TavernResponse> {
    return this.send('GET', `/v1/tavern?sinceId=${sinceId}`, undefined, null);
  }

  sendTavernMessage(body: string): Promise<SendTavernMessageResponse> {
    return this.request('POST', '/v1/tavern', { body });
  }
}

export const api = new ApiClient();
