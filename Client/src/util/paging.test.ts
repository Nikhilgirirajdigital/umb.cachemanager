import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageOf } from "./paging";

const items = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe("pageOf", () => {
  it("returns the first page", () => {
    const page = pageOf(items(120), 0, 50);

    expect(page.items).toEqual(items(50));
    expect(page).toMatchObject({ page: 0, pageCount: 3 });
  });

  it("returns a middle page", () => {
    const page = pageOf(items(120), 1, 50);

    expect(page.items[0]).toBe(50);
    expect(page.items).toHaveLength(50);
    expect(page).toMatchObject({ page: 1, pageCount: 3 });
  });

  it("returns a short last page", () => {
    const page = pageOf(items(120), 2, 50);

    expect(page.items[0]).toBe(100);
    expect(page.items).toHaveLength(20);
    expect(page).toMatchObject({ page: 2, pageCount: 3 });
  });

  // The page index is held per section and survives a filter change, so it can easily point past
  // the end of a freshly narrowed list. Clamping here means no caller has to remember to reset it.
  it("clamps a page index past the end to the last page", () => {
    const page = pageOf(items(120), 99, 50);

    expect(page).toMatchObject({ page: 2, pageCount: 3 });
    expect(page.items).toHaveLength(20);
  });

  it("clamps a negative page index to the first page", () => {
    expect(pageOf(items(120), -3, 50)).toMatchObject({ page: 0, pageCount: 3 });
  });

  // An empty section still renders its head, so this must report one page rather than zero — a
  // pageCount of 0 would make the clamp below compute a page index of -1.
  it("reports one empty page for an empty list", () => {
    const page = pageOf([], 0, 50);

    expect(page.items).toEqual([]);
    expect(page).toMatchObject({ page: 0, pageCount: 1 });
  });

  it("reports a single page when the list fits exactly", () => {
    expect(pageOf(items(50), 0, 50)).toMatchObject({ page: 0, pageCount: 1 });
  });

  it("defaults to PAGE_SIZE", () => {
    expect(pageOf(items(PAGE_SIZE * 2), 0).items).toHaveLength(PAGE_SIZE);
  });
});
