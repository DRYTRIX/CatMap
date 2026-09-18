import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, getTheme, setTheme, watchSystemTheme } from "./theme";

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

describe("watchSystemTheme", () => {
  function mockMq(matches) {
    const listeners = [];
    const mq = {
      matches,
      addEventListener: (_, fn) => listeners.push(fn),
      removeEventListener: vi.fn(),
    };
    window.matchMedia = vi.fn().mockReturnValue(mq);
    return { mq, fire: () => listeners.forEach((fn) => fn()) };
  }

  beforeEach(() => localStorage.clear());

  it("applies OS changes while no explicit choice is stored", () => {
    const { mq, fire } = mockMq(false);
    const onChange = vi.fn();
    watchSystemTheme(onChange);
    mq.matches = true;
    fire();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("ignores OS changes once the user chose a theme", () => {
    const { mq, fire } = mockMq(false);
    const onChange = vi.fn();
    localStorage.setItem("catmap_theme", "light");
    watchSystemTheme(onChange);
    mq.matches = true;
    fire();
    expect(onChange).not.toHaveBeenCalled();
  });
});
