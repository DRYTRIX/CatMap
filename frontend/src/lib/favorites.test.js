import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  addHeart: vi.fn(async () => ({ hearted: true, hearts_count: 1 })),
  removeHeart: vi.fn(async () => ({ hearted: false, hearts_count: 0 })),
  fetchHearts: vi.fn(async () => []),
  importHearts: vi.fn(async () => ({ imported: 0, skipped: 0 })),
}));

import { getFavorites, isFavorite, onFavoritesChanged, removeFavorite, toggleFavorite } from "./favorites";
import { addHeart, removeHeart } from "../api";

describe("favorites/hearts", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("starts empty", () => {
    expect(getFavorites().size).toBe(0);
    expect(isFavorite("a")).toBe(false);
  });

  it("toggleFavorite adds, then removes, a sighting", async () => {
    await expect(toggleFavorite("a")).resolves.toBe(true);
    expect(isFavorite("a")).toBe(true);
    expect(getFavorites().has("a")).toBe(true);
    expect(addHeart).toHaveBeenCalledWith("sighting", "a");

    await expect(toggleFavorite("a")).resolves.toBe(false);
    expect(isFavorite("a")).toBe(false);
    expect(removeHeart).toHaveBeenCalledWith("sighting", "a");
  });

  it("removeFavorite drops an existing favorite", async () => {
    await toggleFavorite("a");
    await removeFavorite("a");
    expect(isFavorite("a")).toBe(false);
  });

  it("removeFavorite is a no-op for a sighting that isn't favorited", async () => {
    await expect(removeFavorite("missing")).resolves.toBeUndefined();
    expect(isFavorite("missing")).toBe(false);
  });

  it("onFavoritesChanged fires with the changed id and new state", async () => {
    const handler = vi.fn();
    const off = onFavoritesChanged(handler);

    await toggleFavorite("a");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ id: "a", favorite: true });

    off();
  });
});
