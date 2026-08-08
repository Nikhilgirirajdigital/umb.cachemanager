import { describe, expect, it } from "vitest";
import type { CacheStoreInfo } from "../api/types";
import {
  applyClearResult,
  parseSelectionKey,
  pruneToExisting,
  retainFailures,
  selectionKey,
} from "./selection";

const store = (name: string, ...keys: string[]): CacheStoreInfo => ({
  store: name,
  displayName: name,
  keysAvailable: true,
  count: keys.length,
  entries: keys.map((key) => ({ key, isSystem: false, expiryKind: "none" })),
});

describe("selectionKey", () => {
  it("distinguishes the same key in different stores", () => {
    expect(selectionKey("memory", "MySite.Nav")).not.toBe(
      selectionKey("runtime", "MySite.Nav")
    );
  });

  it("round-trips through parseSelectionKey", () => {
    expect(parseSelectionKey(selectionKey("memory", "MySite.Nav"))).toEqual({
      store: "memory",
      key: "MySite.Nav",
    });
  });

  it("round-trips a key containing the separator-adjacent characters", () => {
    // Cache keys routinely contain colons, slashes and brackets — none may break the split.
    const key = "OpenIddict:3f2a[Umb.Auth]/token";
    expect(parseSelectionKey(selectionKey("memory", key))).toEqual({
      store: "memory",
      key,
    });
  });
});

describe("pruneToExisting", () => {
  const stores = [store("memory", "A", "B"), store("runtime", "C")];

  it("keeps selections whose entry still exists", () => {
    const selected = new Set([selectionKey("memory", "A"), selectionKey("runtime", "C")]);
    expect(pruneToExisting(selected, stores)).toEqual(selected);
  });

  it("drops a selection whose entry is gone", () => {
    const selected = new Set([selectionKey("memory", "A"), selectionKey("memory", "GONE")]);
    expect([...pruneToExisting(selected, stores)]).toEqual([selectionKey("memory", "A")]);
  });

  it("drops a selection that moved to the other store", () => {
    const selected = new Set([selectionKey("runtime", "A")]);
    expect(pruneToExisting(selected, stores).size).toBe(0);
  });

  it("returns an empty set when there are no stores", () => {
    expect(pruneToExisting(new Set([selectionKey("memory", "A")]), []).size).toBe(0);
  });
});

describe("retainFailures", () => {
  it("is empty on a full success", () => {
    expect(retainFailures([]).size).toBe(0);
  });

  it("keeps exactly the failures so the user can retry", () => {
    const set = retainFailures([{ store: "memory", key: "A" }]);
    expect([...set]).toEqual([selectionKey("memory", "A")]);
  });
});

describe("applyClearResult", () => {
  const selected = new Set([
    selectionKey("memory", "A"),
    selectionKey("memory", "B"),
    selectionKey("runtime", "C"),
  ]);

  it("drops only the entries the batch attempted", () => {
    const next = applyClearResult(selected, [{ store: "memory", key: "A" }], []);
    expect([...next]).toEqual([selectionKey("memory", "B"), selectionKey("runtime", "C")]);
  });

  it("leaves ticks in the other section and store alone", () => {
    // The whole point of the per-section buttons: clearing one section is not a page-wide reset.
    const next = applyClearResult(
      selected,
      [{ store: "memory", key: "A" }, { store: "memory", key: "B" }],
      []
    );
    expect([...next]).toEqual([selectionKey("runtime", "C")]);
  });

  it("keeps a failed entry ticked so the retry is one click away", () => {
    const next = applyClearResult(
      selected,
      [{ store: "memory", key: "A" }, { store: "memory", key: "B" }],
      [{ store: "memory", key: "B" }]
    );
    expect(next.has(selectionKey("memory", "B"))).toBe(true);
    expect(next.has(selectionKey("memory", "A"))).toBe(false);
  });

  it("re-ticks a failure that a refresh had already pruned away", () => {
    // #refresh() prunes before this runs; a failure the server still reports must come back.
    const next = applyClearResult(new Set(), [], [{ store: "memory", key: "A" }]);
    expect([...next]).toEqual([selectionKey("memory", "A")]);
  });

  it("does not mutate the set it was given", () => {
    const before = new Set(selected);
    applyClearResult(selected, [{ store: "memory", key: "A" }], []);
    expect(selected).toEqual(before);
  });
});
