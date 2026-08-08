import type { CacheKeyRef, CacheStoreInfo } from "../api/types";

/**
 * Selections are identified by store + key, never by the key alone: the same key string can
 * legitimately exist in both stores, and clearing one must not clear the other.
 *
 * U+0000 separates them because it cannot appear in a .NET cache key that came from a string
 * literal or a rendered object key, so no key can forge a collision. Built with fromCharCode
 * rather than written literally, so the source file stays plain ASCII — a raw control character
 * here would make the file read as binary to grep, diff and editors.
 */
const SEPARATOR = String.fromCharCode(0);

export const selectionKey = (store: string, key: string): string =>
  `${store}${SEPARATOR}${key}`;

export function parseSelectionKey(id: string): CacheKeyRef {
  const at = id.indexOf(SEPARATOR);
  return { store: id.slice(0, at), key: id.slice(at + 1) };
}

/**
 * Drops selections whose entry no longer exists in the freshly loaded stores, so a stale tick
 * cannot survive a refresh and be cleared later against a key the user never saw.
 */
export function pruneToExisting(
  selected: ReadonlySet<string>,
  stores: readonly CacheStoreInfo[]
): Set<string> {
  const live = new Set<string>();
  for (const store of stores) {
    for (const entry of store.entries) {
      live.add(selectionKey(store.store, entry.key));
    }
  }
  return new Set([...selected].filter((id) => live.has(id)));
}

/**
 * After a batch clear, the selection becomes exactly what the server could NOT clear — so a
 * partial failure leaves the user one click from retrying instead of reselecting by hand.
 */
export function retainFailures(failed: readonly CacheKeyRef[]): Set<string> {
  return new Set(failed.map((f) => selectionKey(f.store, f.key)));
}

/**
 * Clearing is per section and only reaches the rows on screen, so the result may only speak for
 * the batch it attempted: the new selection is the old one minus everything tried, plus whatever
 * the server could not clear. Ticks in the other section, the other store, or on rows the filter
 * is hiding are none of this batch's business and survive untouched — which is why this cannot
 * be `retainFailures` alone.
 */
export function applyClearResult(
  selected: ReadonlySet<string>,
  attempted: readonly CacheKeyRef[],
  failed: readonly CacheKeyRef[]
): Set<string> {
  const next = new Set(selected);
  for (const ref of attempted) {
    next.delete(selectionKey(ref.store, ref.key));
  }
  for (const id of retainFailures(failed)) {
    next.add(id);
  }
  return next;
}
