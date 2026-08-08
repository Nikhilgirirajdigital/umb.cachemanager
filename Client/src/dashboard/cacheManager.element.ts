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
import { CacheManagerRepository } from "../api/cacheManagerRepository";
import type { CacheEntryInfo, CacheKeyRef, CacheStoreInfo } from "../api/types";
import { formatRemaining, isExpiringSoon, remainingMs } from "../util/expiry";
import { applyClearResult, pruneToExisting, selectionKey } from "../util/selection";

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
  /** Bumped once a second; every countdown derives from it, so one timer serves the page. */
  @state() private _now = Date.now();

  #repo = new CacheManagerRepository(() => this.#getToken());
  #authContext?: typeof UMB_AUTH_CONTEXT.TYPE;
  #notification?: UmbNotificationContext;
  #timer?: number;

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
    this.#stopTimer();
    this.#timer = window.setInterval(() => {
      this._now = Date.now();
    }, 1000);
  }

  override disconnectedCallback(): void {
    this.#stopTimer();
    super.disconnectedCallback();
  }

  #stopTimer(): void {
    if (this.#timer !== undefined) {
      window.clearInterval(this.#timer);
      this.#timer = undefined;
    }
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

  #matchesFilter(entry: CacheEntryInfo): boolean {
    const needle = this._filter.trim().toLowerCase();
    return !needle || entry.key.toLowerCase().includes(needle);
  }

  #customEntries(store: CacheStoreInfo): CacheEntryInfo[] {
    return store.entries.filter((e) => !e.isSystem && this.#matchesFilter(e));
  }

  #systemEntries(store: CacheStoreInfo): CacheEntryInfo[] {
    return store.entries.filter((e) => e.isSystem && this.#matchesFilter(e));
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
              (this._filter = (e.target as HTMLInputElement).value)}
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
          : this.#renderTable(store, custom)}

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
            : this.#renderTable(store, system)}
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
  #renderTable(store: CacheStoreInfo, entries: CacheEntryInfo[]) {
    const selectedHere = entries.filter((e) => this.#isSelected(store.store, e.key)).length;
    const all = entries.length > 0 && selectedHere === entries.length;

    return html`
      <uui-table>
        <uui-table-head>
          <uui-table-head-cell class="pick">
            <uui-checkbox
              aria-label="Select all shown"
              .checked=${all}
              .indeterminate=${selectedHere > 0 && !all}
              @change=${(e: Event) =>
                this.#toggleAll(store, entries, (e.target as HTMLInputElement).checked)}
            ></uui-checkbox>
          </uui-table-head-cell>
          <uui-table-head-cell>Key</uui-table-head-cell>
          <uui-table-head-cell>Type</uui-table-head-cell>
          <uui-table-head-cell>Expires</uui-table-head-cell>
          <uui-table-head-cell></uui-table-head-cell>
        </uui-table-head>
        ${repeat(
          entries,
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
              <uui-table-cell class="expires">${this.#renderExpiry(e)}</uui-table-cell>
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
    `;
  }

  #renderExpiry(entry: CacheEntryInfo) {
    const ms = remainingMs(entry.expiresAt, this._now);
    const text = formatRemaining(ms, entry.expiryKind);
    const soon = isExpiringSoon(ms, entry.expiryKind);

    return html`
      <span class=${soon ? "expiry soon" : "expiry"}>${text}</span>
      ${entry.expiryKind === "sliding"
        ? html`<span
            class="sliding"
            title="The clock resets each time the entry is read"
          >(sliding)</span>`
        : nothing}
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
         than letting the note drop under the time and make the row twice as tall. */
      white-space: nowrap;
    }
    .expiry {
      font-variant-numeric: tabular-nums;
    }
    .expiry.soon {
      color: var(--uui-color-danger);
      font-weight: bold;
    }
    .sliding {
      color: var(--uui-color-text-alt);
      font-size: var(--uui-type-small-size);
      margin-left: var(--uui-size-space-2);
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
