import { describe, expect, it } from "vitest";
import { isDraftExpired, isDraftWorthSaving } from "./addDraft";
import { QUEUE_MAX_AGE_MS } from "./offlineQueue";

describe("addDraft", () => {
  it("ignores empty drafts", () => {
    expect(isDraftWorthSaving(null)).toBe(false);
    expect(isDraftWorthSaving({ photos: [], description: "  " })).toBe(false);
    expect(isDraftWorthSaving({ kind: "missing", location: { lat: 1, lng: 2 } })).toBe(false);
  });

  it("saves drafts with photos or text", () => {
    expect(isDraftWorthSaving({ photos: [{}] })).toBe(true);
    expect(isDraftWorthSaving({ photos: [], description: "tabby" })).toBe(true);
    expect(isDraftWorthSaving({ catName: "Miso" })).toBe(true);
  });

  it("expires old drafts", () => {
    const now = 1_000_000_000_000;
    expect(isDraftExpired({ savedAt: now - 1000 }, now)).toBe(false);
    expect(isDraftExpired({ savedAt: now - QUEUE_MAX_AGE_MS - 1 }, now)).toBe(true);
    expect(isDraftExpired(null, now)).toBe(true);
  });
});
