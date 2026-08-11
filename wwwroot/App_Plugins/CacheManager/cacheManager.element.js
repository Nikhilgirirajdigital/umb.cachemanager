import { UmbLitElement as de } from "@umbraco-cms/backoffice/lit-element";
import { css as Y, property as q, state as f, customElement as G, LitElement as pe, nothing as z, html as c, repeat as X } from "@umbraco-cms/backoffice/external/lit";
import { UMB_AUTH_CONTEXT as fe } from "@umbraco-cms/backoffice/auth";
import { UMB_NOTIFICATION_CONTEXT as ye } from "@umbraco-cms/backoffice/notification";
import { umbConfirmModal as me } from "@umbraco-cms/backoffice/modal";
const m = "/umbraco/management/api/v1/cache-manager";
class ge {
  #t;
  constructor(t) {
    this.#t = t;
  }
  async #e() {
    const t = { Accept: "application/json" }, a = await this.#t();
    return a && (t.Authorization = `Bearer ${a}`), t;
  }
  async getCaches() {
    const t = await fetch(`${m}/caches`, { headers: await this.#e() });
    if (!t.ok)
      throw new Error(`Failed to load caches (HTTP ${t.status}).`);
    return await t.json();
  }
  async clearKey(t, a) {
    const s = `store=${encodeURIComponent(t)}&key=${encodeURIComponent(a)}`, r = await fetch(`${m}/key?${s}`, {
      method: "DELETE",
      headers: await this.#e()
    });
    if (!r.ok)
      throw new Error(`Failed to clear '${a}' (HTTP ${r.status}).`);
    return await r.json();
  }
  /**
   * Clears an explicit batch in ONE request. Deliberately not a client-side loop over clearKey:
   * the server clears a whole batch in two cache enumerations per store, where N requests would
   * cost 2N, and a mid-loop failure would leave the view inconsistent until the next refresh.
   */
  async clearKeys(t) {
    const a = await fetch(`${m}/keys`, {
      method: "DELETE",
      headers: { ...await this.#e(), "Content-Type": "application/json" },
      body: JSON.stringify({ items: t })
    });
    if (!a.ok)
      throw new Error(`Failed to clear the selected entries (HTTP ${a.status}).`);
    return await a.json();
  }
  async clearAll() {
    const t = await fetch(`${m}/all`, {
      method: "DELETE",
      headers: await this.#e()
    });
    if (!t.ok)
      throw new Error(`Failed to clear all caches (HTTP ${t.status}).`);
    return await t.json();
  }
  async clearCustom(t) {
    const a = t ? `?store=${encodeURIComponent(t)}` : "", s = await fetch(`${m}/custom${a}`, {
      method: "DELETE",
      headers: await this.#e()
    });
    if (!s.ok)
      throw new Error(`Failed to clear your cache (HTTP ${s.status}).`);
    return await s.json();
  }
  /**
   * The complement of clearCustom. Weaker than clearAll by construction — the server can only
   * remove entries it can enumerate, where clearAll uses each store's native Clear().
   */
  async clearSystem(t) {
    const a = t ? `?store=${encodeURIComponent(t)}` : "", s = await fetch(`${m}/system${a}`, {
      method: "DELETE",
      headers: await this.#e()
    });
    if (!s.ok)
      throw new Error(`Failed to clear the Umbraco & system cache (HTTP ${s.status}).`);
    return await s.json();
  }
}
const we = 50;
function be(e, t, a = we) {
  const s = Math.max(1, Math.ceil(e.length / a)), r = Math.min(Math.max(t, 0), s - 1), o = r * a;
  return {
    items: e.slice(o, o + a),
    // 0-based, matching the `_pages` record. <uui-pagination> counts from 1; the dashboard converts
    // at that one boundary rather than making every index here ambiguous.
    page: r,
    pageCount: s
  };
}
const ke = "\0", d = (e, t) => `${e}${ke}${t}`;
function _e(e, t) {
  const a = /* @__PURE__ */ new Set();
  for (const s of t)
    for (const r of s.entries)
      a.add(d(s.store, r.key));
  return new Set([...e].filter((s) => a.has(s)));
}
function ve(e) {
  return new Set(e.map((t) => d(t.store, t.key)));
}
function $e(e, t, a) {
  const s = new Set(e);
  for (const r of t)
    s.delete(d(r.store, r.key));
  for (const r of ve(a))
    s.add(r);
  return s;
}
function Ce(e, t) {
  if (!e) return null;
  const a = Date.parse(e);
  return Number.isNaN(a) ? null : a - t;
}
function xe(e, t) {
  if (t === "none") return "never";
  if (t === "unknown" || e === null) return "—";
  if (e <= 0) return "expired";
  const a = Math.floor(e / 1e3);
  if (a < 60) return `${a}s`;
  const s = Math.floor(a / 60), r = a % 60;
  if (s < 60) return `${s}m ${String(r).padStart(2, "0")}s`;
  const o = Math.floor(s / 60), l = s % 60;
  if (o < 24) return `${o}h ${l}m`;
  const P = Math.floor(o / 24), ue = o % 24;
  return `${P}d ${ue}h`;
}
function Te(e, t) {
  return t === "none" || t === "unknown" || e === null ? !1 : e > 0 && e < 6e4;
}
const C = /* @__PURE__ */ new Set();
let x;
function Ee(e) {
  C.add(e), x ??= setInterval(() => {
    for (const a of [...C])
      a();
  }, 1e3);
  let t = !1;
  return () => {
    t || (t = !0, C.delete(e), C.size === 0 && x !== void 0 && (clearInterval(x), x = void 0));
  };
}
var Se = Object.defineProperty, Me = Object.getOwnPropertyDescriptor, J = (e) => {
  throw TypeError(e);
}, S = (e, t, a, s) => {
  for (var r = s > 1 ? void 0 : s ? Me(t, a) : t, o = e.length - 1, l; o >= 0; o--)
    (l = e[o]) && (r = (s ? l(t, a, r) : l(r)) || r);
  return s && r && Se(t, a, r), r;
}, V = (e, t, a) => t.has(e) || J("Cannot " + a), Pe = (e, t, a) => (V(e, t, "read from private field"), a ? a.call(e) : t.get(e)), Ue = (e, t, a) => t.has(e) ? J("Cannot add the same private member more than once") : t instanceof WeakSet ? t.add(e) : t.set(e, a), j = (e, t, a, s) => (V(e, t, "write to private field"), t.set(e, a), a), b;
let g = class extends pe {
  constructor() {
    super(...arguments), this.kind = "unknown", this._now = Date.now(), Ue(this, b);
  }
  connectedCallback() {
    super.connectedCallback(), this._now = Date.now(), j(this, b, Ee(() => {
      this._now = Date.now();
    }));
  }
  disconnectedCallback() {
    var e;
    (e = Pe(this, b)) == null || e.call(this), j(this, b, void 0), super.disconnectedCallback();
  }
  render() {
    const e = Ce(this.expiresAt, this._now);
    return c`
      <span class=${Te(e, this.kind) ? "expiry soon" : "expiry"}
        >${xe(e, this.kind)}</span
      >
      ${this.kind === "sliding" ? c`<span class="sliding" title="The clock resets each time the entry is read"
            >(sliding)</span
          >` : z}
    `;
  }
};
b = /* @__PURE__ */ new WeakMap();
g.styles = Y`
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
S([
  q({ attribute: !1 })
], g.prototype, "expiresAt", 2);
S([
  q({ attribute: !1 })
], g.prototype, "kind", 2);
S([
  f()
], g.prototype, "_now", 2);
g = S([
  G("cache-manager-expiry")
], g);
var Ae = Object.defineProperty, Ne = Object.getOwnPropertyDescriptor, Z = (e) => {
  throw TypeError(e);
}, y = (e, t, a, s) => {
  for (var r = s > 1 ? void 0 : s ? Ne(t, a) : t, o = e.length - 1, l; o >= 0; o--)
    (l = e[o]) && (r = (s ? l(t, a, r) : l(r)) || r);
  return s && r && Ae(t, a, r), r;
}, I = (e, t, a) => t.has(e) || Z("Cannot " + a), h = (e, t, a) => (I(e, t, "read from private field"), a ? a.call(e) : t.get(e)), T = (e, t, a) => t.has(e) ? Z("Cannot add the same private member more than once") : t instanceof WeakSet ? t.add(e) : t.set(e, a), B = (e, t, a, s) => (I(e, t, "write to private field"), t.set(e, a), a), n = (e, t, a) => (I(e, t, "access private method"), a), p, k, _, i, Q, v, D, O, R, L, ee, te, F, K, E, ae, se, H, W, M, w, $, ie, ne, re, oe, le, ce, U, A, N, he;
let u = class extends de {
  constructor() {
    super(), T(this, i), this._loading = !0, this._working = !1, this._stores = [], this._filter = "", this._selected = /* @__PURE__ */ new Set(), this._pages = {}, T(this, p, new ge(() => n(this, i, Q).call(this))), T(this, k), T(this, _), this.consumeContext(fe, (e) => {
      B(this, k, e);
    }), this.consumeContext(ye, (e) => {
      B(this, _, e);
    });
  }
  connectedCallback() {
    super.connectedCallback(), n(this, i, v).call(this);
  }
  render() {
    return c`
      <umb-body-layout headline="Cache Manager">
        <div slot="header" class="toolbar">
          <uui-input
            class="search"
            type="search"
            label="Filter key"
            placeholder="Filter key…"
            .value=${this._filter}
            @input=${(e) => n(this, i, te).call(this, e.target.value)}
          ></uui-input>

          <uui-button
            look="secondary"
            label="Refresh"
            .disabled=${this._working}
            @click=${() => n(this, i, v).call(this)}
          >
            <uui-icon name="icon-sync"></uui-icon> Refresh
          </uui-button>

          <uui-button
            look="primary"
            color="danger"
            label="Clear everything"
            .disabled=${this._working}
            @click=${() => n(this, i, le).call(this)}
          >
            Clear everything
          </uui-button>
        </div>

        ${this._loading ? c`<uui-loader></uui-loader>` : X(
      this._stores,
      (e) => e.store,
      (e) => n(this, i, ce).call(this, e)
    )}
      </umb-body-layout>
    `;
  }
};
p = /* @__PURE__ */ new WeakMap();
k = /* @__PURE__ */ new WeakMap();
_ = /* @__PURE__ */ new WeakMap();
i = /* @__PURE__ */ new WeakSet();
Q = async function() {
  return h(this, k) ? await h(this, k).getLatestToken() : void 0;
};
v = async function() {
  this._loading = !0;
  try {
    this._stores = await h(this, p).getCaches(), this._selected = _e(this._selected, this._stores);
  } catch (e) {
    n(this, i, M).call(this, e);
  } finally {
    this._loading = !1;
  }
};
D = function(e, t) {
  const a = this._filter.trim().toLowerCase();
  return e.entries.filter(
    (s) => s.isSystem === t && (!a || s.key.toLowerCase().includes(a))
  );
};
O = function(e) {
  return n(this, i, D).call(this, e, !1);
};
R = function(e) {
  return n(this, i, D).call(this, e, !0);
};
L = function(e, t) {
  return d(e.store, t ? "system" : "custom");
};
ee = function(e, t, a) {
  this._pages = { ...this._pages, [n(this, i, L).call(this, e, t)]: a };
};
te = function(e) {
  this._filter = e, this._pages = {};
};
F = function(e) {
  return e.entries.filter((t) => !t.isSystem).length;
};
K = function(e) {
  return e.entries.filter((t) => t.isSystem).length;
};
E = function(e, t) {
  return this._selected.has(d(e, t));
};
ae = function(e, t, a) {
  const s = new Set(this._selected);
  a ? s.add(d(e, t)) : s.delete(d(e, t)), this._selected = s;
};
se = function(e, t, a) {
  const s = new Set(this._selected);
  for (const r of t) {
    const o = d(e.store, r.key);
    a ? s.add(o) : s.delete(o);
  }
  this._selected = s;
};
H = function(e, t) {
  return (t ? n(this, i, R).call(this, e) : n(this, i, O).call(this, e)).filter((s) => n(this, i, E).call(this, e.store, s.key)).map((s) => ({ store: e.store, key: s.key }));
};
W = function(e) {
  h(this, _)?.peek("positive", { data: { message: e } });
};
M = function(e) {
  const t = e instanceof Error ? e.message : "Something went wrong.";
  h(this, _)?.peek("danger", { data: { message: t } });
};
w = async function(e, t, a) {
  try {
    return await me(this, { headline: e, content: t, confirmLabel: a, color: "danger" }), !0;
  } catch {
    return !1;
  }
};
$ = async function(e, t) {
  this._working = !0;
  try {
    const a = await e();
    n(this, i, W).call(this, a.message ?? t), await n(this, i, v).call(this);
  } catch (a) {
    n(this, i, M).call(this, a);
  } finally {
    this._working = !1;
  }
};
ie = async function(e, t) {
  await n(this, i, w).call(this, "Clear cache entry", `Remove '${t.key}' from ${e.displayName}? This cannot be undone.`, "Clear") && await n(this, i, $).call(this, () => h(this, p).clearKey(e.store, t.key), "Entry cleared.");
};
ne = async function(e) {
  const t = n(this, i, F).call(this, e);
  await n(this, i, w).call(this, "Clear your cache", `Remove your project's ${t} cached entr${t === 1 ? "y" : "ies"} from ${e.displayName}? Umbraco's own caches are left alone. This cannot be undone.`, "Clear your cache") && await n(this, i, $).call(this, () => h(this, p).clearCustom(e.store), "Your cache was cleared.");
};
re = async function(e) {
  const t = n(this, i, K).call(this, e);
  await n(this, i, w).call(this, "Clear Umbraco & system cache", `Remove ${t} Umbraco or system cached entr${t === 1 ? "y" : "ies"} from ${e.displayName}? Your project's own keys are left alone. Pages may be slower until these caches rebuild. This cannot be undone.`, "Clear system cache") && await n(this, i, $).call(this, () => h(this, p).clearSystem(e.store), "Umbraco & system cache was cleared.");
};
oe = async function(e, t) {
  const a = n(this, i, H).call(this, e, t);
  if (a.length === 0) return;
  const s = t ? "Umbraco & system cache" : "your cache";
  if (await n(this, i, w).call(this, "Clear selected cache entries", `Remove ${a.length} selected entr${a.length === 1 ? "y" : "ies"} from ${s} in ${e.displayName}?` + (t ? ` ${a.length === 1 ? "It is an" : "These are"} Umbraco or system ${a.length === 1 ? "key" : "keys"}.` : "") + " This cannot be undone.", "Clear selected")) {
    this._working = !0;
    try {
      const o = await h(this, p).clearKeys(a);
      n(this, i, W).call(this, o.message ?? "Selected entries cleared."), await n(this, i, v).call(this), this._selected = $e(this._selected, a, o.failed ?? []);
    } catch (o) {
      n(this, i, M).call(this, o);
    } finally {
      this._working = !1;
    }
  }
};
le = async function() {
  await n(this, i, w).call(this, "Clear entire cache", "Clear EVERY entry in both stores, including Umbraco's own caches? Pages may be slower until caches rebuild. This cannot be undone.", "Clear everything") && await n(this, i, $).call(this, () => h(this, p).clearAll(), "All caches cleared.");
};
ce = function(e) {
  if (!e.keysAvailable)
    return c`
        <uui-box headline=${e.displayName}>
          ${n(this, i, A).call(this, e)}
          <p class="note">${e.note ?? "Keys could not be enumerated on this runtime."}</p>
        </uui-box>
      `;
  const t = n(this, i, O).call(this, e), a = n(this, i, R).call(this, e);
  return c`
      <uui-box headline=${e.displayName}>
        ${n(this, i, A).call(this, e)}

        <div class="section-head">
          <h4>Your cache (${t.length})</h4>
          <div class="section-actions">
            ${n(this, i, U).call(this, e, !1)}
            <uui-button
              look="secondary"
              color="danger"
              label="Clear your cache"
              .disabled=${this._working || n(this, i, F).call(this, e) === 0}
              @click=${() => n(this, i, ne).call(this, e)}
            >
              Clear your cache
            </uui-button>
          </div>
        </div>

        ${t.length === 0 ? c`<p class="note">No keys from your project to show.</p>` : n(this, i, N).call(this, e, t, !1)}

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
              @click=${(s) => s.stopPropagation()}
            >
              ${n(this, i, U).call(this, e, !0)}
              <uui-button
                look="secondary"
                color="danger"
                label="Clear system cache"
                .disabled=${this._working || n(this, i, K).call(this, e) === 0}
                @click=${() => n(this, i, re).call(this, e)}
              >
                Clear system cache
              </uui-button>
            </span>
          </summary>
          ${a.length === 0 ? c`<p class="note">No Umbraco or system keys to show.</p>` : n(this, i, N).call(this, e, a, !0)}
        </details>
      </uui-box>
    `;
};
U = function(e, t) {
  const a = n(this, i, H).call(this, e, t).length;
  return c`
      <uui-button
        look="secondary"
        color="danger"
        label="Clear selected"
        .disabled=${this._working || a === 0}
        @click=${() => n(this, i, oe).call(this, e, t)}
      >
        Clear selected (${a})
      </uui-button>
    `;
};
A = function(e) {
  return e.description ? c`<span slot="headline" class="store-description">${e.description}</span>` : z;
};
N = function(e, t, a) {
  const s = be(t, this._pages[n(this, i, L).call(this, e, a)] ?? 0), r = s.items.filter((l) => n(this, i, E).call(this, e.store, l.key)).length, o = s.items.length > 0 && r === s.items.length;
  return c`
      <uui-table>
        <uui-table-head>
          <uui-table-head-cell class="pick">
            <uui-checkbox
              aria-label="Select all shown"
              .checked=${o}
              .indeterminate=${r > 0 && !o}
              @change=${(l) => n(this, i, se).call(this, e, s.items, l.target.checked)}
            ></uui-checkbox>
          </uui-table-head-cell>
          <uui-table-head-cell>Key</uui-table-head-cell>
          <uui-table-head-cell>Type</uui-table-head-cell>
          <uui-table-head-cell>Expires</uui-table-head-cell>
          <uui-table-head-cell></uui-table-head-cell>
        </uui-table-head>
        ${X(
    s.items,
    (l) => l.key,
    (l) => c`
            <uui-table-row>
              <uui-table-cell class="pick">
                <uui-checkbox
                  aria-label="Select ${l.key}"
                  .checked=${n(this, i, E).call(this, e.store, l.key)}
                  @change=${(P) => n(this, i, ae).call(this, e.store, l.key, P.target.checked)}
                ></uui-checkbox>
              </uui-table-cell>
              <uui-table-cell><span class="key">${l.key}</span></uui-table-cell>
              <uui-table-cell>${l.valueType ?? "—"}</uui-table-cell>
              <uui-table-cell class="expires">
                <cache-manager-expiry
                  .expiresAt=${l.expiresAt}
                  .kind=${l.expiryKind}
                ></cache-manager-expiry>
              </uui-table-cell>
              <uui-table-cell class="actions">
                <uui-button
                  look="secondary"
                  color="danger"
                  label="Clear ${l.key}"
                  .disabled=${this._working}
                  @click=${() => n(this, i, ie).call(this, e, l)}
                >
                  Clear
                </uui-button>
              </uui-table-cell>
            </uui-table-row>
          `
  )}
      </uui-table>
      ${n(this, i, he).call(this, e, a, s)}
    `;
};
he = function(e, t, a) {
  return a.pageCount <= 1 ? z : c`
      <div class="pager">
        <uui-pagination
          label=${`${e.displayName}, ${t ? "Umbraco & system cache" : "your cache"}`}
          .total=${a.pageCount}
          .current=${a.page + 1}
          @change=${(s) => (
    // uui-pagination counts from 1, _pages from 0. This is the only place the two meet.
    n(this, i, ee).call(this, e, t, s.target.current - 1)
  )}
        ></uui-pagination>
      </div>
    `;
};
u.styles = Y`
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
y([
  f()
], u.prototype, "_loading", 2);
y([
  f()
], u.prototype, "_working", 2);
y([
  f()
], u.prototype, "_stores", 2);
y([
  f()
], u.prototype, "_filter", 2);
y([
  f()
], u.prototype, "_selected", 2);
y([
  f()
], u.prototype, "_pages", 2);
u = y([
  G("cache-manager-dashboard")
], u);
export {
  u as CacheManagerDashboardElement
};
//# sourceMappingURL=cacheManager.element.js.map
