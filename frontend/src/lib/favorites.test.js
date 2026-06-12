import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFavorites, isFavorite, onFavoritesChanged, removeFavorite, toggleFavorite } from "./favorites";

describe("favorites", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty", () => {
    expect(getFavorites().size).toBe(0);
    expect(isFavorite("a")).toBe(false);
  });

  it("toggleFavorite adds, then removes, a sighting", () => {
    expect(toggleFavorite("a")).toBe(true);
    expect(isFavorite("a")).toBe(true);
    expect(getFavorites().has("a")).toBe(true);

    expect(toggleFavorite("a")).toBe(false);
    expect(isFavorite("a")).toBe(false);
  });

  it("removeFavorite drops an existing favorite", () => {
    toggleFavorite("a");
    removeFavorite("a");
    expect(isFavorite("a")).toBe(false);
  });

  it("removeFavorite is a no-op for a sighting that isn't favorited", () => {
    expect(() => removeFavorite("missing")).not.toThrow();
    expect(isFavorite("missing")).toBe(false);
  });

  it("onFavoritesChanged fires with the changed id and new state", () => {
    const handler = vi.fn();
    const off = onFavoritesChanged(handler);

    toggleFavorite("a");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ id: "a", favorite: true });

    off();
    toggleFavorite("a");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
