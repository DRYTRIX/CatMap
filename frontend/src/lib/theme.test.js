import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, getTheme, setTheme } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the OS preference when nothing is stored", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(getTheme()).toBe("dark");

    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    expect(getTheme()).toBe("light");
  });

  it("setTheme persists the choice and applies it", () => {
    setTheme("dark");
    expect(localStorage.getItem("catmap_theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(getTheme()).toBe("dark");
  });

  it("a stored theme overrides the OS preference", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    setTheme("light");
    expect(getTheme()).toBe("light");
  });

  it("applyTheme sets the attribute without touching storage", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("catmap_theme")).toBeNull();
  });
});
