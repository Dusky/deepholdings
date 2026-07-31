const API_OVERRIDE_KEY = 'deepholdings.apiUrl';

/** Just enough of `localStorage` to remember an override, and easy to fake. */
export interface OverrideStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BaseUrlEnvironment {
  /** Baked in at build time from `VITE_API_URL`, or the local default. */
  configured: string;
  /** Dev builds honour `?api=`; release builds never do. */
  dev: boolean;
  /** `window.location.search`. */
  search: string;
  /** `window.localStorage`, or null where the browser refuses to hand one over. */
  storage: OverrideStorage | null;
}

/**
 * Where the API lives.
 *
 * Baked in at build time, because a device cannot reach the build machine's
 * localhost. In dev builds only, `?api=http://192.168.1.42:8787` overrides it
 * and is remembered — that lets one dev server be pointed at any host from a
 * phone without rebuilding. Never honoured in a release build, where the API
 * address is not something a URL should be able to change.
 *
 * Remembering the override is a convenience and must never be a precondition
 * for using it. This was a real bug: a phone whose browser refused storage
 * threw inside `setItem`, which skipped past the override entirely and left the
 * client talking to `localhost:8787` — the phone itself. The page loaded, every
 * request went to a host that was never listening, and the failure looked
 * exactly like a server that was down.
 */
export function resolveBaseUrl(env: BaseUrlEnvironment): string {
  const configured = withoutTrailingSlash(env.configured);
  if (!env.dev) return configured;

  const fromQuery = queryOverride(env.search);
  if (fromQuery) {
    try {
      env.storage?.setItem(API_OVERRIDE_KEY, fromQuery);
    } catch {
      // Private mode, blocked cookies, a full quota. The override still stands
      // for this load; it just will not survive a reload without the query.
    }
    return withoutTrailingSlash(fromQuery);
  }

  try {
    const remembered = env.storage?.getItem(API_OVERRIDE_KEY);
    if (remembered) return withoutTrailingSlash(remembered);
  } catch {
    // No storage, no remembered override.
  }

  return configured;
}

function queryOverride(search: string): string | null {
  try {
    return new URLSearchParams(search).get('api');
  } catch {
    return null;
  }
}

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}
