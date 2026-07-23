import { describe, expect, it } from "vitest";
import { selectExpired, QUEUE_MAX_AGE_MS } from "./offlineQueue";

describe("offlineQueue.selectExpired", () => {
  const now = 1_000_000_000_000;

  it("keeps fresh entries and drops stale ones", () => {
    const items = [
      { id: 1, queuedAt: now - 1000 }, // fresh
      { id: 2, queuedAt: now - QUEUE_MAX_AGE_MS - 1 }, // just expired
      { id: 3, queuedAt: now - 30 * 24 * 60 * 60 * 1000 }, // very old
    ];
    const stale = selectExpired(items, now);
    expect(stale.map((i) => i.id)).toEqual([2, 3]);
  });

  it("treats entries without queuedAt as expired", () => {
    const stale = selectExpired([{ id: 9 }], now);
    expect(stale).toHaveLength(1);
  });

  it("respects a custom maxAge", () => {
    const items = [{ id: 1, queuedAt: now - 5000 }];
    expect(selectExpired(items, now, 10_000)).toHaveLength(0);
    expect(selectExpired(items, now, 1000)).toHaveLength(1);
  });
});
