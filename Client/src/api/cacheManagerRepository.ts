import type { ApiMessage, CacheKeyRef, CacheStoreInfo, ClearKeysResponse } from "./types";

const BASE = "/umbraco/management/api/v1/cache-manager";

export type TokenProvider = () => Promise<string | undefined>;

/**
 * Thin fetch wrapper over the Cache Manager Management API. It attaches the backoffice bearer
 * token (obtained from UMB_AUTH_CONTEXT by the caller) to every request. No OpenAPI codegen —
 * the surface is six endpoints.
 */
export class CacheManagerRepository {
  #getToken: TokenProvider;

  constructor(getToken: TokenProvider) {
    this.#getToken = getToken;
  }

  async #headers(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = await this.#getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  async getCaches(): Promise<CacheStoreInfo[]> {
    const res = await fetch(`${BASE}/caches`, { headers: await this.#headers() });
    if (!res.ok) {
      throw new Error(`Failed to load caches (HTTP ${res.status}).`);
    }
    return (await res.json()) as CacheStoreInfo[];
  }

  async clearKey(store: string, key: string): Promise<ApiMessage> {
    const query = `store=${encodeURIComponent(store)}&key=${encodeURIComponent(key)}`;
    const res = await fetch(`${BASE}/key?${query}`, {
      method: "DELETE",
      headers: await this.#headers(),
    });
    if (!res.ok) {
      throw new Error(`Failed to clear '${key}' (HTTP ${res.status}).`);
    }
    return (await res.json()) as ApiMessage;
  }

  /**
   * Clears an explicit batch in ONE request. Deliberately not a client-side loop over clearKey:
   * the server clears a whole batch in two cache enumerations per store, where N requests would
   * cost 2N, and a mid-loop failure would leave the view inconsistent until the next refresh.
   */
  async clearKeys(items: CacheKeyRef[]): Promise<ClearKeysResponse> {
    const res = await fetch(`${BASE}/keys`, {
      method: "DELETE",
      headers: { ...(await this.#headers()), "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      throw new Error(`Failed to clear the selected entries (HTTP ${res.status}).`);
    }
    return (await res.json()) as ClearKeysResponse;
  }

  async clearAll(): Promise<ApiMessage> {
    const res = await fetch(`${BASE}/all`, {
      method: "DELETE",
      headers: await this.#headers(),
    });
    if (!res.ok) {
      throw new Error(`Failed to clear all caches (HTTP ${res.status}).`);
    }
    return (await res.json()) as ApiMessage;
  }

  async clearCustom(store?: string): Promise<ApiMessage> {
    const query = store ? `?store=${encodeURIComponent(store)}` : "";
    const res = await fetch(`${BASE}/custom${query}`, {
      method: "DELETE",
      headers: await this.#headers(),
    });
    if (!res.ok) {
      throw new Error(`Failed to clear your cache (HTTP ${res.status}).`);
    }
    return (await res.json()) as ApiMessage;
  }

  /**
   * The complement of clearCustom. Weaker than clearAll by construction — the server can only
   * remove entries it can enumerate, where clearAll uses each store's native Clear().
   */
  async clearSystem(store?: string): Promise<ApiMessage> {
    const query = store ? `?store=${encodeURIComponent(store)}` : "";
    const res = await fetch(`${BASE}/system${query}`, {
      method: "DELETE",
      headers: await this.#headers(),
    });
    if (!res.ok) {
      throw new Error(`Failed to clear the Umbraco & system cache (HTTP ${res.status}).`);
    }
    return (await res.json()) as ApiMessage;
  }
}
