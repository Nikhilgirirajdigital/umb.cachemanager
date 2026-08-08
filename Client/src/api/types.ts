// Wire contract from the Umbraco 17 Management API. NOTE: unlike the v13 package (Newtonsoft,
// PascalCase on the wire), v17 serializes with System.Text.Json, so these are camelCase.

/** "none" = never expires. "unknown" = could not be determined. Deliberately distinct. */
export type ExpiryKind = "absolute" | "sliding" | "none" | "unknown";

export interface CacheEntryInfo {
  key: string;
  valueType?: string | null;
  isSystem: boolean;
  /** Absolute ISO-8601 UTC instant, or null when the entry never expires / is unknown. */
  expiresAt?: string | null;
  expiryKind: ExpiryKind;
}

export interface CacheStoreInfo {
  store: string;
  displayName: string;
  /** What this store is and which concrete type backs it, resolved server-side at runtime. */
  description?: string | null;
  keysAvailable: boolean;
  count: number;
  note?: string | null;
  entries: CacheEntryInfo[];
}

export interface ApiMessage {
  message?: string;
  cleared?: number;
}

/** One entry, identified by store + displayed key. Mirrors the C# CacheKeyRef. */
export interface CacheKeyRef {
  store: string;
  key: string;
}

export interface ClearKeysResponse extends ApiMessage {
  /** Entries confirmed still cached after the clear. Empty on a full success. */
  failed?: CacheKeyRef[];
}
