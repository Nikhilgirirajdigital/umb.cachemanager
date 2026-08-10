import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToTick } from "./ticker";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("subscribeToTick", () => {
  it("notifies a subscriber once per second", () => {
    const seen = vi.fn();
    const stop = subscribeToTick(seen);

    vi.advanceTimersByTime(3000);

    expect(seen).toHaveBeenCalledTimes(3);
    stop();
  });

  // One interval serves the whole page however many countdowns are on screen — the point of
  // hoisting the timer out of the individual cells.
  it("drives every subscriber from a single interval", () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeToTick(a);
    const stopB = subscribeToTick(b);

    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(1000);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    stopA();
    stopB();
  });

  it("stops notifying an unsubscribed listener but keeps the rest running", () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeToTick(a);
    const stopB = subscribeToTick(b);

    stopA();
    vi.advanceTimersByTime(1000);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    stopB();
  });

  // Paging away from a table disconnects its countdowns; leaving the interval running would leak
  // a timer per navigation for the life of the backoffice session.
  it("clears the interval once the last subscriber leaves", () => {
    const stop = subscribeToTick(vi.fn());
    expect(vi.getTimerCount()).toBe(1);

    stop();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("restarts the interval when a subscriber arrives after the last one left", () => {
    subscribeToTick(vi.fn())();

    const seen = vi.fn();
    const stop = subscribeToTick(seen);
    vi.advanceTimersByTime(1000);

    expect(seen).toHaveBeenCalledTimes(1);
    stop();
  });

  it("is safe to unsubscribe twice", () => {
    const stop = subscribeToTick(vi.fn());
    stop();

    expect(() => stop()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
