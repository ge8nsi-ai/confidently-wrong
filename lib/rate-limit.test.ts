import { describe, expect, it, beforeEach } from "vitest";
import { clientIp, rateLimit, resetRateLimits } from "./rate-limit";

const LIMIT = 20;

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows the first 20 requests in a window and rejects the 21st", () => {
    const now = 1_000_000;
    for (let i = 1; i <= LIMIT; i += 1) {
      expect(rateLimit("1.2.3.4", LIMIT, now).ok, `request ${i}`).toBe(true);
    }
    const blocked = rateLimit("1.2.3.4", LIMIT, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const now = 2_000_000;
    for (let i = 0; i < LIMIT + 3; i += 1) rateLimit("5.6.7.8", LIMIT, now);
    expect(rateLimit("5.6.7.8", LIMIT, now).ok).toBe(false);
    expect(rateLimit("5.6.7.8", LIMIT, now + 60_001).ok).toBe(true);
  });

  it("tracks each client separately", () => {
    const now = 3_000_000;
    for (let i = 0; i < LIMIT + 1; i += 1) rateLimit("a", LIMIT, now);
    expect(rateLimit("a", LIMIT, now).ok).toBe(false);
    expect(rateLimit("b", LIMIT, now).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the first entry of x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
    expect(clientIp(h)).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip then to unknown", () => {
    expect(clientIp(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
