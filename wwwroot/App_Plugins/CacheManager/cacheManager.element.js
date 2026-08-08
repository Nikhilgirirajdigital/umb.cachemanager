import { UmbLitElement as ee } from "@umbraco-cms/backoffice/lit-element";
import { css as te, state as y, customElement as ae, html as l, repeat as K, nothing as j } from "@umbraco-cms/backoffice/external/lit";
import { UMB_AUTH_CONTEXT as se } from "@umbraco-cms/backoffice/auth";
import { UMB_NOTIFICATION_CONTEXT as ie } from "@umbraco-cms/backoffice/notification";
import { umbConfirmModal as ne } from "@umbraco-cms/backoffice/modal";
const f = "/umbraco/management/api/v1/cache-manager";
class oe {
  #t;
  constructor(t) {
    this.#t = t;
  }
  async #e() {
    const t = { Accept: "application/json" }, a = await this.#t();
    return a && (t.Authorization = `Bearer ${a}`), t;
  }
  async getCaches() {
    const t = await fetch(`${f}/caches`, { headers: await this.#e() });
    if (!t.ok)
      throw new Error(`Failed to load caches (HTTP ${t.status}).`);
    return await t.json();
  }
  async clearKey(t, a) {
    const n = `store=${encodeURIComponent(t)}&key=${encodeURIComponent(a)}`, o = await fetch(`${f}/key?${n}`, {
      method: "DELETE",
      headers: await this.#e()
    });
    if (!o.ok)
      throw new Error(`Failed to clear '${a}' (HTTP ${o.status}).`);
    return await o.json();
  }
  /**
   * Clears an explicit batch in ONE request. Deliberately not a client-side loop over clearKey:
   * the server clears a whole batch in two cache enumerations per store, where N requests would
   * cost 2N, and a mid-loop failure would leave the view inconsistent until the next refresh.
   */
  async clearKeys(t) {
    const a = await fetch(`${f}/keys`, {
      method: "DELETE",
      headers: { ...await this.#e(), "Content-Type": "application/json" },
      body: JSON.stringify({ items: t })
    });
    if (!a.ok)
      throw new Error(`Failed to clear the selected entries (HTTP ${a.status}).`);
    return await a.json();
  }
  async clearAll() {
    const t = await fetch(`${f}/all`, {
      method: "DELETE",
      headers: await this.#e()
    });
    if (!t.ok)
      throw new Error(`Failed to clear all caches (HTTP ${t.status}).`);
    return await t.json();
  }
  async clearCustom(t) {
    const a = t ? `?store=${encodeURIComponent(t)}` : "", n = await fetch(`${f}/custom${a}`, {
      method: "DELETE",
      headers: await this.#e()
    });
    if (!n.ok)
      throw new Error(`Failed to clear your cache (HTTP ${n.status}).`);
    return await n.json();
  }
  /**
   * The complement of clearCustom. Weaker than clearAll by construction — the server can only
   * remove entries it can enumerate, where clearAll uses each store's native Clear().
   */
  async clearSystem(t) {
    const a = t ? `?store=${encodeURIComponent(t)}` : "", n = await fetch(`${f}/system${a}`, {
      method: "DELETE",
      headers: await this.#e()
    });
    if (!n.ok)
      throw new Error(`Failed to clear the Umbraco & system cache (HTTP ${n.status}).`);
    return await n.json();
  }
}
function re(e, t) {
  if (!e) return null;
  const a = Date.parse(e);
  return Number.isNaN(a) ? null : a - t;
}
function le(e, t) {
  if (t === "none") return "never";
  if (t === "unknown" || e === null) return "—";
  if (e <= 0) return "expired";
  const a = Math.floor(e / 1e3);
  if (a < 60) return `${a}s`;
  const n = Math.floor(a / 60), o = a % 60;
  if (n < 60) return `${n}m ${String(o).padStart(2, "0")}s`;
  const r = Math.floor(n / 60), b = n % 60;
  if (r < 24) return `${r}h ${b}m`;
  const Q = Math.floor(r / 24), Z = r % 24;
  return `${Q}d ${Z}h`;
}
function ce(e, t) {
  return t === "none" || t === "unknown" || e === null ? !1 : e > 0 && e < 6e4;
}
const he = "\0", d = (e, t) => `${e}${he}${t}`;
function ue(e, t) {
  const a = /* @__PURE__ */ new Set();
  for (const n of t)
    for (const o of n.entries)
      a.add(d(n.store, o.key));
  return new Set([...e].filter((n) => a.has(n)));
}
function de(e) {
  return new Set(e.map((t) => d(t.store, t.key)));
}
function pe(e, t, a) {
  const n = new Set(e);
  for (const o of t)
    n.delete(d(o.store, o.key));
  for (const o of de(a))
    n.add(o);
  return n;
}
var fe = Object.defineProperty, me = Object.getOwnPropertyDescriptor, O = (e) => {
  throw TypeError(e);
}, p = (e, t, a, n) => {
  for (var o = n > 1 ? void 0 : n ? me(t, a) : t, r = e.length - 1, b; r >= 0; r--)
    (b = e[r]) && (o = (n ? b(t, a, o) : b(o)) || o);
  return n && o && fe(t, a, o), o;
}, z = (e, t, a) => t.has(e) || O("Cannot " + a), c = (e, t, a) => (z(e, t, "read from private field"), a ? a.call(e) : t.get(e)), g = (e, t, a) => t.has(e) ? O("Cannot add the same private member more than once") : t instanceof WeakSet ? t.add(e) : t.set(e, a), C = (e, t, a, n) => (z(e, t, "write to private field"), t.set(e, a), a), i = (e, t, a) => (z(e, t, "access private method"), a), u, k, _, m, s, E, L, $, N, I, A, P, R, x, H, W, D, F, T, w, v, Y, B, q, X, G, J, S, M, U, V;
let h = class extends ee {
  constructor() {
    super(), g(this, s), this._loading = !0, this._working = !1, this._stores = [], this._filter = "", this._selected = /* @__PURE__ */ new Set(), this._now = Date.now(), g(this, u, new oe(() => i(this, s, L).call(this))), g(this, k), g(this, _), g(this, m), this.consumeContext(se, (e) => {
      C(this, k, e);
    }), this.consumeContext(ie, (e) => {
      C(this, _, e);
    });
  }
  connectedCallback() {
    super.connectedCallback(), i(this, s, $).call(this), i(this, s, E).call(this), C(this, m, window.setInterval(() => {
      this._now = Date.now();
    }, 1e3));
  }
  disconnectedCallback() {
    i(this, s, E).call(this), super.disconnectedCallback();
  }
  render() {
    return l`
      <umb-body-layout headline="Cache Manager">
        <div slot="header" class="toolbar">
          <uui-input
            class="search"
            type="search"
            label="Filter key"
            placeholder="Filter key…"
            .value=${this._filter}
            @input=${(e) => this._filter = e.target.value}
          ></uui-input>

          <uui-button
            look="secondary"
            label="Refresh"
            .disabled=${this._working}
            @click=${() => i(this, s, $).call(this)}
          >
            <uui-icon name="icon-sync"></uui-icon> Refresh
          </uui-button>

          <uui-button
            look="primary"
            color="danger"
            label="Clear everything"
            .disabled=${this._working}
            @click=${() => i(this, s, G).call(this)}
          >
            Clear everything
          </uui-button>
        </div>

        ${this._loading ? l`<uui-loader></uui-loader>` : K(
      this._stores,
      (e) => e.store,
      (e) => i(this, s, J).call(this, e)
    )}
      </umb-body-layout>
    `;
  }
};
u = /* @__PURE__ */ new WeakMap();
k = /* @__PURE__ */ new WeakMap();
_ = /* @__PURE__ */ new WeakMap();
m = /* @__PURE__ */ new WeakMap();
s = /* @__PURE__ */ new WeakSet();
E = function() {
  c(this, m) !== void 0 && (window.clearInterval(c(this, m)), C(this, m, void 0));
};
L = async function() {
  return c(this, k) ? await c(this, k).getLatestToken() : void 0;
};
$ = async function() {
  this._loading = !0;
  try {
    this._stores = await c(this, u).getCaches(), this._selected = ue(this._selected, this._stores);
  } catch (e) {
    i(this, s, T).call(this, e);
  } finally {
    this._loading = !1;
  }
};
N = function(e) {
  const t = this._filter.trim().toLowerCase();
  return !t || e.key.toLowerCase().includes(t);
};
I = function(e) {
  return e.entries.filter((t) => !t.isSystem && i(this, s, N).call(this, t));
};
A = function(e) {
  return e.entries.filter((t) => t.isSystem && i(this, s, N).call(this, t));
};
P = function(e) {
  return e.entries.filter((t) => !t.isSystem).length;
};
R = function(e) {
  return e.entries.filter((t) => t.isSystem).length;
};
x = function(e, t) {
  return this._selected.has(d(e, t));
};
H = function(e, t, a) {
  const n = new Set(this._selected);
  a ? n.add(d(e, t)) : n.delete(d(e, t)), this._selected = n;
};
W = function(e, t, a) {
  const n = new Set(this._selected);
  for (const o of t) {
    const r = d(e.store, o.key);
    a ? n.add(r) : n.delete(r);
  }
  this._selected = n;
};
D = function(e, t) {
  return (t ? i(this, s, A).call(this, e) : i(this, s, I).call(this, e)).filter((n) => i(this, s, x).call(this, e.store, n.key)).map((n) => ({ store: e.store, key: n.key }));
};
F = function(e) {
  c(this, _)?.peek("positive", { data: { message: e } });
};
T = function(e) {
  const t = e instanceof Error ? e.message : "Something went wrong.";
  c(this, _)?.peek("danger", { data: { message: t } });
};
w = async function(e, t, a) {
  try {
    return await ne(this, { headline: e, content: t, confirmLabel: a, color: "danger" }), !0;
  } catch {
    return !1;
  }
};
v = async function(e, t) {
  this._working = !0;
  try {
    const a = await e();
    i(this, s, F).call(this, a.message ?? t), await i(this, s, $).call(this);
  } catch (a) {
    i(this, s, T).call(this, a);
  } finally {
    this._working = !1;
  }
};
Y = async function(e, t) {
  await i(this, s, w).call(this, "Clear cache entry", `Remove '${t.key}' from ${e.displayName}? This cannot be undone.`, "Clear") && await i(this, s, v).call(this, () => c(this, u).clearKey(e.store, t.key), "Entry cleared.");
};
B = async function(e) {
  const t = i(this, s, P).call(this, e);
  await i(this, s, w).call(this, "Clear your cache", `Remove your project's ${t} cached entr${t === 1 ? "y" : "ies"} from ${e.displayName}? Umbraco's own caches are left alone. This cannot be undone.`, "Clear your cache") && await i(this, s, v).call(this, () => c(this, u).clearCustom(e.store), "Your cache was cleared.");
};
q = async function(e) {
  const t = i(this, s, R).call(this, e);
  await i(this, s, w).call(this, "Clear Umbraco & system cache", `Remove ${t} Umbraco or system cached entr${t === 1 ? "y" : "ies"} from ${e.displayName}? Your project's own keys are left alone. Pages may be slower until these caches rebuild. This cannot be undone.`, "Clear system cache") && await i(this, s, v).call(this, () => c(this, u).clearSystem(e.store), "Umbraco & system cache was cleared.");
};
X = async function(e, t) {
  const a = i(this, s, D).call(this, e, t);
  if (a.length === 0) return;
  const n = t ? "Umbraco & system cache" : "your cache";
  if (await i(this, s, w).call(this, "Clear selected cache entries", `Remove ${a.length} selected entr${a.length === 1 ? "y" : "ies"} from ${n} in ${e.displayName}?` + (t ? ` ${a.length === 1 ? "It is an" : "These are"} Umbraco or system ${a.length === 1 ? "key" : "keys"}.` : "") + " This cannot be undone.", "Clear selected")) {
    this._working = !0;
    try {
      const r = await c(this, u).clearKeys(a);
      i(this, s, F).call(this, r.message ?? "Selected entries cleared."), await i(this, s, $).call(this), this._selected = pe(this._selected, a, r.failed ?? []);
    } catch (r) {
      i(this, s, T).call(this, r);
    } finally {
      this._working = !1;
    }
  }
};
G = async function() {
  await i(this, s, w).call(this, "Clear entire cache", "Clear EVERY entry in both stores, including Umbraco's own caches? Pages may be slower until caches rebuild. This cannot be undone.", "Clear everything") && await i(this, s, v).call(this, () => c(this, u).clearAll(), "All caches cleared.");
};
J = function(e) {
  if (!e.keysAvailable)
    return l`
        <uui-box headline=${e.displayName}>
          ${i(this, s, M).call(this, e)}
          <p class="note">${e.note ?? "Keys could not be enumerated on this runtime."}</p>
        </uui-box>
      `;
  const t = i(this, s, I).call(this, e), a = i(this, s, A).call(this, e);
  return l`
      <uui-box headline=${e.displayName}>
        ${i(this, s, M).call(this, e)}

        <div class="section-head">
          <h4>Your cache (${t.length})</h4>
          <div class="section-actions">
            ${i(this, s, S).call(this, e, !1)}
            <uui-button
              look="secondary"
              color="danger"
              label="Clear your cache"
              .disabled=${this._working || i(this, s, P).call(this, e) === 0}
              @click=${() => i(this, s, B).call(this, e)}
            >
              Clear your cache
            </uui-button>
          </div>
        </div>

        ${t.length === 0 ? l`<p class="note">No keys from your project to show.</p>` : i(this, s, U).call(this, e, t)}

        <details class="system">
          <!-- The <summary> IS this section's head — same flex row, same <h4> as "Your cache"
               above, so an open section reads identically. Not "Umbraco cache": this also holds
               OpenIddict, third-party packages, and framework entries — anything that isn't the
               host site's own. -->
          <summary>
            <h4>Umbraco &amp; system cache (${a.length})</h4>
            <!-- stopPropagation is load-bearing: a click anywhere in a <summary> toggles the
                 disclosure, so without it either button would also collapse the section out from
                 under the user. It also catches the click uui-button synthesises from a Space
                 keypress. -->
            <span
              class="section-actions"
              @click=${(n) => n.stopPropagation()}
            >
              ${i(this, s, S).call(this, e, !0)}
              <uui-button
                look="secondary"
                color="danger"
                label="Clear system cache"
                .disabled=${this._working || i(this, s, R).call(this, e) === 0}
                @click=${() => i(this, s, q).call(this, e)}
              >
                Clear system cache
              </uui-button>
            </span>
          </summary>
          ${a.length === 0 ? l`<p class="note">No Umbraco or system keys to show.</p>` : i(this, s, U).call(this, e, a)}
        </details>
      </uui-box>
    `;
};
S = function(e, t) {
  const a = i(this, s, D).call(this, e, t).length;
  return l`
      <uui-button
        look="secondary"
        color="danger"
        label="Clear selected"
        .disabled=${this._working || a === 0}
        @click=${() => i(this, s, X).call(this, e, t)}
      >
        Clear selected (${a})
      </uui-button>
    `;
};
M = function(e) {
  return e.description ? l`<span slot="headline" class="store-description">${e.description}</span>` : j;
};
U = function(e, t) {
  const a = t.filter((o) => i(this, s, x).call(this, e.store, o.key)).length, n = t.length > 0 && a === t.length;
  return l`
      <uui-table>
        <uui-table-head>
          <uui-table-head-cell class="pick">
            <uui-checkbox
              aria-label="Select all shown"
              .checked=${n}
              .indeterminate=${a > 0 && !n}
              @change=${(o) => i(this, s, W).call(this, e, t, o.target.checked)}
            ></uui-checkbox>
          </uui-table-head-cell>
          <uui-table-head-cell>Key</uui-table-head-cell>
          <uui-table-head-cell>Type</uui-table-head-cell>
          <uui-table-head-cell>Expires</uui-table-head-cell>
          <uui-table-head-cell></uui-table-head-cell>
        </uui-table-head>
        ${K(
    t,
    (o) => o.key,
    (o) => l`
            <uui-table-row>
              <uui-table-cell class="pick">
                <uui-checkbox
                  aria-label="Select ${o.key}"
                  .checked=${i(this, s, x).call(this, e.store, o.key)}
                  @change=${(r) => i(this, s, H).call(this, e.store, o.key, r.target.checked)}
                ></uui-checkbox>
              </uui-table-cell>
              <uui-table-cell><span class="key">${o.key}</span></uui-table-cell>
              <uui-table-cell>${o.valueType ?? "—"}</uui-table-cell>
              <uui-table-cell class="expires">${i(this, s, V).call(this, o)}</uui-table-cell>
              <uui-table-cell class="actions">
                <uui-button
                  look="secondary"
                  color="danger"
                  label="Clear ${o.key}"
                  .disabled=${this._working}
                  @click=${() => i(this, s, Y).call(this, e, o)}
                >
                  Clear
                </uui-button>
              </uui-table-cell>
            </uui-table-row>
          `
  )}
      </uui-table>
    `;
};
V = function(e) {
  const t = re(e.expiresAt, this._now), a = le(t, e.expiryKind), n = ce(t, e.expiryKind);
  return l`
      <span class=${n ? "expiry soon" : "expiry"}>${a}</span>
      ${e.expiryKind === "sliding" ? l`<span
            class="sliding"
            title="The clock resets each time the entry is read"
          >(sliding)</span>` : j}
    `;
};
h.styles = te`
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
p([
  y()
], h.prototype, "_loading", 2);
p([
  y()
], h.prototype, "_working", 2);
p([
  y()
], h.prototype, "_stores", 2);
p([
  y()
], h.prototype, "_filter", 2);
p([
  y()
], h.prototype, "_selected", 2);
p([
  y()
], h.prototype, "_now", 2);
h = p([
  ae("cache-manager-dashboard")
], h);
export {
  h as CacheManagerDashboardElement
};
//# sourceMappingURL=cacheManager.element.js.map
