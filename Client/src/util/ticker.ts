type Listener = () => void;

const listeners = new Set<Listener>();
let handle: ReturnType<typeof setInterval> | undefined;

/**
 * A single page-wide one-second tick that countdown cells subscribe to.
 *
 * The dashboard used to hold the clock itself, in a `@state` field. Lit has no partial re-render,
 * so bumping it re-ran the whole template every second — re-committing bindings across every row
 * and, worse, re-firing `slotchange` on every `uui-table-cell`, whose handler forces a synchronous
 * layout. One clock tick therefore cost a full-document layout per cell on screen.
 *
 * Owning the clock here instead lets each countdown re-render only its OWN shadow root. The cell's
 * assigned nodes never change, so no `slotchange` fires and no layout is forced.
 *
 * The interval exists only while something is listening: countdowns disconnect as the user pages
 * through a table, and a timer left running per page turn would leak for the whole session.
 */
export function subscribeToTick(listener: Listener): () => void {
  listeners.add(listener);

  handle ??= setInterval(() => {
    // Copied first: a listener may unsubscribe (or subscribe) while being notified.
    for (const l of [...listeners]) {
      l();
    }
  }, 1000);

  let done = false;

  return () => {
    // Guarded so a double unsubscribe cannot clear an interval a LATER subscriber started.
    if (done) {
      return;
    }
    done = true;

    listeners.delete(listener);

    if (listeners.size === 0 && handle !== undefined) {
      clearInterval(handle);
      handle = undefined;
    }
  };
}
