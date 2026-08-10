import {
  LitElement,
  css,
  html,
  nothing,
  customElement,
  property,
  state,
} from "@umbraco-cms/backoffice/external/lit";
import type { ExpiryKind } from "../api/types";
import { formatRemaining, isExpiringSoon, remainingMs } from "../util/expiry";
import { subscribeToTick } from "../util/ticker";

/**
 * One live countdown, owning its own clock subscription.
 *
 * This is a separate element purely so the clock cannot reach the dashboard's template. When the
 * dashboard held `_now` itself, each tick re-ran the whole page: every row's bindings re-committed
 * and — the expensive part — every `uui-table-cell` saw its assigned nodes replaced, firing the
 * `slotchange` handler that reads `scrollWidth`/`clientWidth` and forces a synchronous layout.
 *
 * Here the tick only dirties THIS element's shadow root. The node assigned to the containing
 * cell's slot is this element itself and it never changes, so no `slotchange` fires and no layout
 * is forced, however many countdowns are on screen.
 *
 * The expiry text styles live here rather than in the dashboard because shadow DOM encapsulates
 * them — the dashboard's stylesheet cannot reach inside this element.
 */
@customElement("cache-manager-expiry")
export class CacheManagerExpiryElement extends LitElement {
  /** Absolute ISO-8601 UTC instant, or null when the entry never expires / is unknown. */
  @property({ attribute: false }) expiresAt?: string | null;

  @property({ attribute: false }) kind: ExpiryKind = "unknown";

  @state() private _now = Date.now();

  #unsubscribe?: () => void;

  override connectedCallback(): void {
    super.connectedCallback();
    // Re-read on connect: a row paged back into view may have been away for minutes.
    this._now = Date.now();
    this.#unsubscribe = subscribeToTick(() => {
      this._now = Date.now();
    });
  }

  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    super.disconnectedCallback();
  }

  override render() {
    const ms = remainingMs(this.expiresAt, this._now);

    return html`
      <span class=${isExpiringSoon(ms, this.kind) ? "expiry soon" : "expiry"}
        >${formatRemaining(ms, this.kind)}</span
      >
      ${this.kind === "sliding"
        ? html`<span class="sliding" title="The clock resets each time the entry is read"
            >(sliding)</span
          >`
        : nothing}
    `;
  }

  static override styles = css`
    :host {
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cache-manager-expiry": CacheManagerExpiryElement;
  }
}
