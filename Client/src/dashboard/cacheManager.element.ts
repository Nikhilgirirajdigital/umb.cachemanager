import { UmbLitElement } from "@umbraco-cms/backoffice/lit-element";
import {
  css,
  html,
  nothing,
  repeat,
  customElement,
  state,
} from "@umbraco-cms/backoffice/external/lit";
import { UMB_AUTH_CONTEXT } from "@umbraco-cms/backoffice/auth";
import {
  UMB_NOTIFICATION_CONTEXT,
  type UmbNotificationContext,
} from "@umbraco-cms/backoffice/notification";
import { umbConfirmModal } from "@umbraco-cms/backoffice/modal";
// Type only — <uui-pagination> is already registered by the backoffice (its `external/uui` barrel
// re-exports @umbraco-ui/uui, which pulls in uui-pagination), exactly as with uui-table below. A
// value import would bundle the backoffice, which vite.config.ts externalizes on purpose.
import type { UUIPaginationElement } from "@umbraco-cms/backoffice/external/uui";
import { CacheManagerRepository } from "../api/cacheManagerRepository";
import type { CacheEntryInfo, CacheKeyRef, CacheStoreInfo } from "../api/types";
import { pageOf, type Page } from "../util/paging";
import { applyClearResult, pruneToExisting, selectionKey } from "../util/selection";
// Registers <cache-manager-expiry>, which owns the countdown clock. Importing it for the
// side effect is the whole point — see the note on _pages about why the clock left this file.
import "./cacheExpiry.element";

@customElement("cache-manager-dashboard")
export class CacheManagerDashboardElement extends UmbLitElement {
  @state() private _loading = true;
  @state() private _working = false;
  @state() private _stores: CacheStoreInfo[] = [];
  @state() private _filter = "";
  /**
   * Ticked entries, as `store\0key` ids. Lit does not re-render on in-place Set mutation, so
   * every change below reassigns a fresh Set rather than calling add/delete on this one.
   */
  @state() private _selected = new Set<string>();

  /**
   * Current page per section, keyed by store + section. Paging exists because `uui-table-cell`
   * forces a synchronous layout from its `slotchange` handler, making a full table cost
   * O(cells^2) — see the note in util/paging.ts. It bounds only what is RENDERED: filtering,
   * selection and clearing all still act on the whole filtered section.
   *
   * There is deliberately no clock in this element any more. `_now` used to live here, and Lit
   * has no partial re-render, so each tick re-ran the entire template and re-fired every cell's
   * layout-forcing `slotchange`. <cache-manager-expiry> owns its own subscription instead.
   */
  @state() private _pages: Record<string, number> = {};

  #repo = new CacheManagerRepository(() => this.#getToken());
  #authContext?: typeof UMB_AUTH_CONTEXT.TYPE;
  #notification?: UmbNotificationContext;

  constructor() {
    super();
    this.consumeContext(UMB_AUTH_CONTEXT, (ctx) => {
      this.#authContext = ctx;
    });
    this.consumeContext(UMB_NOTIFICATION_CONTEXT, (ctx) => {
      this.#notification = ctx;
    });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#refresh();
  }

  async #getToken(): Promise<string | undefined> {
    return this.#authContext ? await this.#authContext.getLatestToken() : undefined;
  }

  async #refresh(): Promise<void> {
    this._loading = true;
    try {
      this._stores = await this.#repo.getCaches();
      // A tick must not outlive the entry it pointed at.
      this._selected = pruneToExisting(this._selected, this._stores);
    } catch (err) {
      this.#error(err);
    } finally {
      this._loading = false;
    }
  }

  /**
   * The filtered rows of one section. The needle is normalised ONCE per call rather than per
   * entry: these run several times per render, per store, and a render can cover thousands of
   * entries.
   */
  #entriesIn(store: CacheStoreInfo, system: boolean): CacheEntryInfo[] {
    const needle = this._filter.trim().toLowerCase();
    return store.entries.filter(
      (e) => e.isSystem === system && (!needle || e.key.toLowerCase().includes(needle))
    );
  }

  #customEntries(store: CacheStoreInfo): CacheEntryInfo[] {
    return this.#entriesIn(store, false);
  }

  #systemEntries(store: CacheStoreInfo): CacheEntryInfo[] {
    return this.#entriesIn(store, true);
  }

  #pageKey(store: CacheStoreInfo, system: boolean): string {
    return selectionKey(store.store, system ? "system" : "custom");
  }

  #setPage(store: CacheStoreInfo, system: boolean, page: number): void {
    this._pages = { ...this._pages, [this.#pageKey(store, system)]: page };
  }

  /**
   * Filtering renarrows every section at once, so a page index held for the old list is
   * meaningless. `pageOf` would clamp it, but clamping lands the user on the LAST page of the new
   * results — starting from the first is what they expect after typing.
   */
  #setFilter(value: string): void {
    this._filter = value;
    this._pages = {};
  }

  /**
   * UNFILTERED counts, for the two bulk buttons only. `/custom` and `/system` clear a whole store
   * server-side and know nothing about the key filter, so counting the filtered rows would promise
   * "Remove your project's 2 cached entries" and then remove thirty.
   *
   * This is the opposite rule to #selectedRefsIn, and deliberately so: a "Clear selected" button
   * acts on ticked rows the user can see, a bulk button acts on the whole section either way.
   */
  #customCount(store: CacheStoreInfo): number {
    return store.entries.filter((e) => !e.isSystem).length;
  }

  #systemCount(store: CacheStoreInfo): number {
    return store.entries.filter((e) => e.isSystem).length;
  }

  #isSelected(store: string, key: string): boolean {
    return this._selected.has(selectionKey(store, key));
  }

  #toggle(store: string, key: string, on: boolean): void {
    const next = new Set(this._selected);
    if (on) {
      next.add(selectionKey(store, key));
    } else {
      next.delete(selectionKey(store, key));
    }
    this._selected = next;
  }

  /** Applies to the rows currently VISIBLE in one table — never to filtered-out or other rows. */
  #toggleAll(store: CacheStoreInfo, entries: CacheEntryInfo[], on: boolean): void {
    const next = new Set(this._selected);
    for (const entry of entries) {
      const id = selectionKey(store.store, entry.key);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    this._selected = next;
  }

  /**
   * The ticked entries among the rows a section is currently SHOWING — built from the same
   * filtered list the table renders, so the button's count is always what is on screen and can
   * never clear a row the filter has hidden. Matches "select all shown" in the header checkbox.
   * A tick on a filtered-out row survives untouched and comes back into scope with the filter.
   */
  #selectedRefsIn(store: CacheStoreInfo, system: boolean): CacheKeyRef[] {
    const shown = system ? this.#systemEntries(store) : this.#customEntries(store);
    return shown
      .filter((e) => this.#isSelected(store.store, e.key))
      .map((e) => ({ store: store.store, key: e.key }));
  }

  #success(message: string): void {
    this.#notification?.peek("positive", { data: { message } });
  }

  #error(err: unknown): void {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    this.#notification?.peek("danger", { data: { message } });
  }

  async #confirm(headline: string, content: string, confirmLabel: string): Promise<boolean> {
    try {
      await umbConfirmModal(this, { headline, content, confirmLabel, color: "danger" });
      return true;
    } catch {
      return false;
    }
  }

  async #run(action: () => Promise<{ message?: string }>, fallback: string): Promise<void> {
    this._working = true;
    try {
      const res = await action();
      this.#success(res.message ?? fallback);
      await this.#refresh();
    } catch (err) {
      this.#error(err);
    } finally {
      this._working = false;
    }
  }

  async #clearKey(store: CacheStoreInfo, entry: CacheEntryInfo): Promise<void> {
    const ok = await this.#confirm(
      "Clear cache entry",
      `Remove '${entry.key}' from ${store.displayName}? This cannot be undone.`,
      "Clear"
    );
    if (!ok) return;

    await this.#run(() => this.#repo.clearKey(store.store, entry.key), "Entry cleared.");
  }

  async #clearCustom(store: CacheStoreInfo): Promise<void> {
    const count = this.#customCount(store);
    const ok = await this.#confirm(
      "Clear your cache",
      `Remove your project's ${count} cached entr${count === 1 ? "y" : "ies"} from ` +
        `${store.displayName}? Umbraco's own caches are left alone. This cannot be undone.`,
      "Clear your cache"
    );
    if (!ok) return;

    await this.#run(() => this.#repo.clearCustom(store.store), "Your cache was cleared.");
  }

  /**
   * The complement of #clearCustom. Reaches only entries the server can enumerate — unlike
   * "Clear everything", which uses each store's native Clear() and so also drops unlistable ones.
   */
  async #clearSystem(store: CacheStoreInfo): Promise<void> {
    const count = this.#systemCount(store);
    const ok = await this.#confirm(
      "Clear Umbraco & system cache",
      `Remove ${count} Umbraco or system cached entr${count === 1 ? "y" : "ies"} from ` +
        `${store.displayName}? Your project's own keys are left alone. Pages may be slower ` +
        `until these caches rebuild. This cannot be undone.`,
      "Clear system cache"
    );
    if (!ok) return;

    await this.#run(
      () => this.#repo.clearSystem(store.store),
      "Umbraco & system cache was cleared."
    );
  }

  /**
   * Scoped to what one section of one store is showing — the button lives in that section's
   * header, so it must never reach across into the other section, the other store, or rows the
   * filter is hiding. It clears exactly the ticked rows the user can see it next to.
   */
  async #clearSelectedIn(store: CacheStoreInfo, system: boolean): Promise<void> {
    const refs = this.#selectedRefsIn(store, system);
    if (refs.length === 0) return;

    const section = system ? "Umbraco & system cache" : "your cache";
    const ok = await this.#confirm(
      "Clear selected cache entries",
      `Remove ${refs.length} selected entr${refs.length === 1 ? "y" : "ies"} from ` +
        `${section} in ${store.displayName}?` +
        (system
          ? ` ${refs.length === 1 ? "It is an" : "These are"} Umbraco or system ` +
            `${refs.length === 1 ? "key" : "keys"}.`
          : "") +
        " This cannot be undone.",
      "Clear selected"
    );
    if (!ok) return;

    // Not #run(): the selection must be reconciled AFTER the refresh, which itself prunes it.
    this._working = true;
    try {
      const res = await this.#repo.clearKeys(refs);
      this.#success(res.message ?? "Selected entries cleared.");
      await this.#refresh();
      // Only this batch is settled; a partial failure leaves exactly its failures ticked.
      this._selected = applyClearResult(this._selected, refs, res.failed ?? []);
    } catch (err) {
      this.#error(err);
    } finally {
      this._working = false;
    }
  }

  // Nuclear option: clears EVERYTHING in both stores (Umbraco caches included) via each store's
  // native Clear() — more thorough than looping keys because it also drops entries we cannot list.
  async #clearAll(): Promise<void> {
    const ok = await this.#confirm(
      "Clear entire cache",
      "Clear EVERY entry in both stores, including Umbraco's own caches? " +
        "Pages may be slower until caches rebuild. This cannot be undone.",
      "Clear everything"
    );
    if (!ok) return;

    await this.#run(() => this.#repo.clearAll(), "All caches cleared.");
  }

  override render() {
    return html`
      <umb-body-layout headline="Cache Manager">
        <div slot="header" class="toolbar">
          <uui-input
            class="search"
            type="search"
            label="Filter key"
            placeholder="Filter key…"
            .value=${this._filter}
            @input=${(e: InputEvent) =>
              this.#setFilter((e.target as HTMLInputElement).value)}
          ></uui-input>

          <uui-button
            look="secondary"
            label="Refresh"
            .disabled=${this._working}
            @click=${() => this.#refresh()}
          >
            <uui-icon name="icon-sync"></uui-icon> Refresh
          </uui-button>

          <uui-button
            look="primary"
            color="danger"
            label="Clear everything"
            .disabled=${this._working}
            @click=${() => this.#clearAll()}
          >
            Clear everything
          </uui-button>
        </div>

        ${this._loading
          ? html`<uui-loader></uui-loader>`
          : repeat(
              this._stores,
              (s) => s.store,
              (s) => this.#renderStore(s)
            )}
      </umb-body-layout>
    `;
  }

  #renderStore(store: CacheStoreInfo) {
    if (!store.keysAvailable) {
      return html`
        <uui-box headline=${store.displayName}>
          ${this.#renderDescription(store)}
          <p class="note">${store.note ?? "Keys could not be enumerated on this runtime."}</p>
        </uui-box>
      `;
    }

    const custom = this.#customEntries(store);
    const system = this.#systemEntries(store);

    return html`
      <uui-box headline=${store.displayName}>
        ${this.#renderDescription(store)}

        <div class="section-head">
          <h4>Your cache (${custom.length})</h4>
          <div class="section-actions">
            ${this.#renderClearSelected(store, false)}
            <uui-button
              look="secondary"
              color="danger"
              label="Clear your cache"
              .disabled=${this._working || this.#customCount(store) === 0}
              @click=${() => this.#clearCustom(store)}
            >
              Clear your cache
            </uui-button>
          </div>
        </div>

        ${custom.length === 0
          ? html`<p class="note">No keys from your project to show.</p>`
          : this.#renderTable(store, custom, false)}

        <details class="system">
          <!-- The <summary> IS this section's head — same flex row, same <h4> as "Your cache"
               above, so an open section reads identically. Not "Umbraco cache": this also holds
               OpenIddict, third-party packages, and framework entries — anything that isn't the
               host site's own. -->
          <summary>
            <h4>Umbraco &amp; system cache (${system.length})</h4>
            <!-- stopPropagation is load-bearing: a click anywhere in a <summary> toggles the
                 disclosure, so without it either button would also collapse the section out from
                 under the user. It also catches the click uui-button synthesises from a Space
                 keypress. -->
            <span
              class="section-actions"
              @click=${(e: Event) => e.stopPropagation()}
            >
              ${this.#renderClearSelected(store, true)}
              <uui-button
                look="secondary"
                color="danger"
                label="Clear system cache"
                .disabled=${this._working || this.#systemCount(store) === 0}
                @click=${() => this.#clearSystem(store)}
              >
                Clear system cache
              </uui-button>
            </span>
          </summary>
          ${system.length === 0
            ? html`<p class="note">No Umbraco or system keys to show.</p>`
            : this.#renderTable(store, system, true)}
        </details>
      </uui-box>
    `;
  }

  /**
   * One per section, counting that section's ticks only — the toolbar no longer carries a
   * page-wide "Clear selected", so the button that clears a selection now sits with the rows
   * it will clear and can never surprise the user by reaching into the other section.
   */
  #renderClearSelected(store: CacheStoreInfo, system: boolean) {
    const count = this.#selectedRefsIn(store, system).length;

    return html`
      <uui-button
        look="secondary"
        color="danger"
        label="Clear selected"
        .disabled=${this._working || count === 0}
        @click=${() => this.#clearSelectedIn(store, system)}
      >
        Clear selected (${count})
      </uui-button>
    `;
  }

  // slot="headline", NOT slot="header": uui-box's header is a non-wrapping flex row, so a header
  // item can only sit BESIDE the title, and the row is in uui-box's shadow DOM where we cannot
  // set flex-wrap on it. The headline slot renders inside the <h5> itself, so a block-level span
  // there lands on its own line under the title — hence the font resets in .store-description.
  #renderDescription(store: CacheStoreInfo) {
    return store.description
      ? html`<span slot="headline" class="store-description">${store.description}</span>`
      : nothing;
  }

  // Checkboxes below use aria-label, NOT uui-checkbox's `label` property. `label` renders as
  // VISIBLE text beside the box, which repeated every key next to the Key column and stretched
  // the rows. With no label its internal span is empty, and uui-boolean-input's own
  // "span.label:empty { display: none }" rule then removes the slot completely — while the input
  // still takes its accessible name from the host's aria-label, which it prefers over `label`.
  // Only ONE PAGE of rows reaches the DOM. That is not cosmetic: uui-table-cell wires its
  // _detectOverflow to the cell's slotchange unconditionally, and that handler reads scrollWidth
  // and clientWidth — layout-forcing reads. Inserting every cell at once therefore flushes layout
  // once per cell over a document that is still growing, which is O(cells^2) and froze the tab for
  // minutes on a site with ~700 entries (~3,500 cells). A page of 50 keeps it at ~250.
  #renderTable(store: CacheStoreInfo, entries: CacheEntryInfo[], system: boolean) {
    const page = pageOf(entries, this._pages[this.#pageKey(store, system)] ?? 0);

    // "Select all shown" means the rows on THIS PAGE — the ones the user can actually see next to
    // the checkbox. It is deliberately narrower than "Clear selected", which still counts every
    // tick in the filtered section (including other pages), so paging can never silently drop a
    // tick the user made earlier.
    const selectedHere = page.items.filter((e) => this.#isSelected(store.store, e.key)).length;
    const all = page.items.length > 0 && selectedHere === page.items.length;

    return html`
      <uui-table>
        <uui-table-head>
          <uui-table-head-cell class="pick">
            <uui-checkbox
              aria-label="Select all shown"
              .checked=${all}
              .indeterminate=${selectedHere > 0 && !all}
              @change=${(e: Event) =>
                this.#toggleAll(store, page.items, (e.target as HTMLInputElement).checked)}
            ></uui-checkbox>
          </uui-table-head-cell>
          <uui-table-head-cell>Key</uui-table-head-cell>
          <uui-table-head-cell>Type</uui-table-head-cell>
          <uui-table-head-cell>Expires</uui-table-head-cell>
          <uui-table-head-cell></uui-table-head-cell>
        </uui-table-head>
        ${repeat(
          page.items,
          (e) => e.key,
          (e) => html`
            <uui-table-row>
              <uui-table-cell class="pick">
                <uui-checkbox
                  aria-label="Select ${e.key}"
                  .checked=${this.#isSelected(store.store, e.key)}
                  @change=${(ev: Event) =>
                    this.#toggle(store.store, e.key, (ev.target as HTMLInputElement).checked)}
                ></uui-checkbox>
              </uui-table-cell>
              <uui-table-cell><span class="key">${e.key}</span></uui-table-cell>
              <uui-table-cell>${e.valueType ?? "—"}</uui-table-cell>
              <uui-table-cell class="expires">
                <cache-manager-expiry
                  .expiresAt=${e.expiresAt}
                  .kind=${e.expiryKind}
                ></cache-manager-expiry>
              </uui-table-cell>
              <uui-table-cell class="actions">
                <uui-button
                  look="secondary"
                  color="danger"
                  label="Clear ${e.key}"
                  .disabled=${this._working}
                  @click=${() => this.#clearKey(store, e)}
                >
                  Clear
                </uui-button>
              </uui-table-cell>
            </uui-table-row>
          `
        )}
      </uui-table>
      ${this.#renderPager(store, system, page)}
    `;
  }

  /**
   * Hidden when everything fits on one page — the section head already carries the count, so a
   * lone "1" button would be noise.
   *
   * `.total` is bound before `.current` on purpose: uui-pagination's `current` setter clamps into
   * [1, this.total] and its `total` setter does NOT re-clamp afterwards, so with the element's
   * default total of 100 still in place, binding current first would pin any section past page 100
   * (a store over 5,000 entries) to page 100 for good.
   *
   * `label` is not visible text — uui-pagination folds it into the aria-label as
   * "<label>. Current page: <current>". All four sections render a pager, so it has to name both
   * the store and the section or a screen reader hears four identical ones.
   */
  #renderPager(store: CacheStoreInfo, system: boolean, page: Page<CacheEntryInfo>) {
    if (page.pageCount <= 1) {
      return nothing;
    }

    return html`
      <div class="pager">
        <uui-pagination
          label=${`${store.displayName}, ${system ? "Umbraco & system cache" : "your cache"}`}
          .total=${page.pageCount}
          .current=${page.page + 1}
          @change=${(e: Event) =>
            // uui-pagination counts from 1, _pages from 0. This is the only place the two meet.
            this.#setPage(store, system, (e.target as UUIPaginationElement).current - 1)}
        ></uui-pagination>
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: block;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      /* The whole cluster sits right: the filter leads it, and the action buttons still end at
         the bar's right edge rather than being pushed across it. */
      justify-content: flex-end;
      gap: var(--uui-size-space-4);
      width: 100%;
    }
    .toolbar .search {
      /* A narrow refinement, not the page's main control — fixed width instead of flex-grow. */
      flex: 0 0 220px;
      min-width: 0;
    }
    uui-box {
      margin: var(--uui-size-layout-1);
    }
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--uui-size-space-3);
      margin-bottom: var(--uui-size-space-3);
    }
    .section-head h4 {
      margin: 0;
    }
    .section-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--uui-size-space-3);
    }
    details.system {
      margin-top: var(--uui-size-space-5);
      border-top: 1px solid var(--uui-color-divider);
      padding-top: var(--uui-size-space-3);
    }
    /* The summary IS the section head — same declarations as .section-head, so an open system
       section matches "Your cache" above it. */
    details.system summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--uui-size-space-3);
      cursor: pointer;
      /* Firefox's marker survives display:flex; the ::-webkit- rule below covers the rest. */
      list-style: none;
    }
    details.system[open] summary {
      /* Matches .section-head's gap above its table. Collapsed, the summary is the whole section
         and needs no trailing space. */
      margin-bottom: var(--uui-size-space-3);
    }
    details.system summary h4 {
      display: flex;
      align-items: center;
      margin: 0;
    }
    /* display:flex on a <summary> drops the native disclosure triangle in Chromium and WebKit, so
       we draw our own. CSS-only on purpose: a <uui-symbol-expand> would need the open state
       mirrored into a Lit @state, making a self-sufficient <details> controlled for decoration. */
    details.system summary::-webkit-details-marker {
      display: none;
    }
    details.system summary h4::before {
      content: "";
      width: 0;
      height: 0;
      border-left: 5px solid currentColor;
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
      margin-right: var(--uui-size-space-2);
      transition: transform 100ms ease;
    }
    details.system[open] summary h4::before {
      transform: rotate(90deg);
    }
    /* Collapsed, the buttons would act on rows the user has not seen — "Clear system cache" would
       wipe every platform entry in the store sight unseen. They appear with the table. */
    details.system:not([open]) summary .section-actions {
      display: none;
    }
    .note {
      color: var(--uui-color-text-alt);
      font-style: italic;
    }
    .store-description {
      /* Rendered inside uui-box's <h5>, so every heading font property has to be undone —
         otherwise the description reads as a second, smaller headline. */
      display: block;
      margin: var(--uui-size-space-1) 0 0;
      color: var(--uui-color-text-alt);
      font-size: var(--uui-type-small-size);
      font-weight: normal;
      line-height: 1.4;
      text-transform: none;
      letter-spacing: normal;
    }
    .key {
      font-family: var(--uui-font-monospace, monospace);
      word-break: break-all;
    }
    .expires {
      /* Countdown and its "(sliding)" note are one reading — keep them on a single line rather
         than letting the note drop under the time and make the row twice as tall. The countdown's
         own text styling lives in cacheExpiry.element.ts: shadow DOM encapsulates it, so this
         stylesheet cannot reach inside <cache-manager-expiry>. */
      white-space: nowrap;
    }
    .pager {
      /* The grey band the backoffice's own pagers sit on. They get it for free by sitting on the
         page background; ours is inside a uui-box, whose surface is white, so the band has to be
         drawn here. Both are TOKENS, not literals: surface-alt is #f3f3f5 in the light theme and
         #373e47 in the dark one, so hardcoding the grey would break dark mode.

         The padding lives on this wrapper rather than on uui-pagination itself: the element sizes
         its visible page buttons from its own offsetWidth, which INCLUDES its padding, so padding
         it directly would have it claim ~24px it cannot draw in and fit one button too many. */
      background-color: var(--uui-color-surface-alt);
      border-top: 1px solid var(--uui-color-divider-standalone);
      padding: var(--uui-size-space-4);
      margin-top: var(--uui-size-layout-1);
    }
    uui-pagination {
      /* Block, matching the backoffice's own umb-collection-pagination. Load-bearing as well as
         conventional: the element declares no :host display of its own, and shrink-wrapped it would
         measure the buttons it already has instead of the space available to it. */
      display: block;
    }
    .pick {
      /* Shrink-to-fit: the column holds a bare checkbox, so it must not claim a share of the
         table's width or add row height. */
      width: 1px;
      white-space: nowrap;
      padding-right: 0;
      vertical-align: middle;
    }
    .pick uui-checkbox {
      display: block;
      line-height: 0;
    }
    .actions {
      text-align: right;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cache-manager-dashboard": CacheManagerDashboardElement;
  }
}
