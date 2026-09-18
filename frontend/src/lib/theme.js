const STORAGE_KEY = "catmap_theme";

export function getTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function setTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

// Follow live OS theme changes until the user picks a theme explicitly.
// Returns an unsubscribe function.
export function watchSystemTheme(onChange) {
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mq?.addEventListener) return () => {};
  const handler = () => {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (stored === "light" || stored === "dark") return;
    const next = mq.matches ? "dark" : "light";
    applyTheme(next);
    onChange?.(next);
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
