import { describe, expect, it } from "vitest";
import { formatRemaining, isExpiringSoon, remainingMs } from "./expiry";

describe("remainingMs", () => {
  it("returns null when there is no expiry", () => {
    expect(remainingMs(null, 1000)).toBeNull();
    expect(remainingMs(undefined, 1000)).toBeNull();
  });

  it("returns the difference from now", () => {
    const now = Date.parse("2026-08-03T12:00:00.000Z");
    expect(remainingMs("2026-08-03T12:05:00.000Z", now)).toBe(300_000);
  });

  it("returns a negative value for a past instant", () => {
    const now = Date.parse("2026-08-03T12:00:00.000Z");
    expect(remainingMs("2026-08-03T11:59:00.000Z", now)).toBe(-60_000);
  });
});

describe("formatRemaining", () => {
  it("reports never for kind none", () => {
    expect(formatRemaining(null, "none")).toBe("never");
  });

  it("reports an em dash for kind unknown", () => {
    expect(formatRemaining(null, "unknown")).toBe("—");
  });

  it("reports an em dash when the value is null but the kind expects one", () => {
    expect(formatRemaining(null, "absolute")).toBe("—");
  });

  it("reports expired at or below zero", () => {
    expect(formatRemaining(0, "absolute")).toBe("expired");
    expect(formatRemaining(-5000, "absolute")).toBe("expired");
  });

  it("formats sub-minute values in seconds", () => {
    expect(formatRemaining(999, "absolute")).toBe("0s");
    expect(formatRemaining(2000, "absolute")).toBe("2s");
    expect(formatRemaining(59_000, "absolute")).toBe("59s");
  });

  it("formats minutes with zero-padded seconds", () => {
    expect(formatRemaining(60_000, "absolute")).toBe("1m 00s");
    expect(formatRemaining(61_500, "absolute")).toBe("1m 01s");
    expect(formatRemaining(252_000, "absolute")).toBe("4m 12s");
  });

  it("formats hours", () => {
    expect(formatRemaining(3_600_000, "absolute")).toBe("1h 0m");
    expect(formatRemaining(5_400_000, "absolute")).toBe("1h 30m");
  });

  it("formats days", () => {
    expect(formatRemaining(90_000_000, "absolute")).toBe("1d 1h");
  });
});

describe("isExpiringSoon", () => {
  it("is true under a minute", () => expect(isExpiringSoon(30_000, "absolute")).toBe(true));
  it("is false at a minute", () => expect(isExpiringSoon(60_000, "absolute")).toBe(false));
  it("is false when expired", () => expect(isExpiringSoon(-1, "absolute")).toBe(false));
  it("is false when never", () => expect(isExpiringSoon(null, "none")).toBe(false));
});
