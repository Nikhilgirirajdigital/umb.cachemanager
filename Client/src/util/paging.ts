/**
 * Why this exists at all: `uui-table-cell` attaches its `_detectOverflow` handler to the cell's
 * `slotchange` unconditionally, and that handler reads `scrollWidth`/`clientWidth` — layout-
 * forcing reads. Every cell inserted therefore flushes layout for the whole document, so rendering
 * a store's entries in one go costs O(cells^2). A site with ~700 entries puts ~3,500 cells on the
 * page and locks the tab for minutes.
 *
 * Capping what reaches the DOM is the fix. It is a RENDERING bound only: filtering, selection and
 * clearing all still operate on the whole filtered section, so paging can never narrow what a
 * button acts on.
 */
export const PAGE_SIZE = 50;

export interface Page<T> {
  items: T[];
  /** The requested index after clamping — callers should render from this, not from their input. */
  page: number;
  pageCount: number;
  /** 1-based inclusive display range; both 0 when there is nothing to show. */
  from: number;
  to: number;
  total: number;
}

/**
 * One page of `items`, with the index CLAMPED into range rather than trusted.
 *
 * The page index is held per section and outlives a filter change, so it routinely points past the
 * end of a freshly narrowed list. Clamping here rather than at each call site means a stale index
 * degrades to "the last page" instead of an empty table with no way back.
 */
export function pageOf<T>(
  items: readonly T[],
  page: number,
  size: number = PAGE_SIZE
): Page<T> {
  const total = items.length;
  // An empty section still renders its head and pager, so it is one empty page, not zero pages.
  const pageCount = Math.max(1, Math.ceil(total / size));
  const clamped = Math.min(Math.max(page, 0), pageCount - 1);
  const start = clamped * size;
  const slice = items.slice(start, start + size);

  return {
    items: slice,
    page: clamped,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : start + slice.length,
    total,
  };
}
