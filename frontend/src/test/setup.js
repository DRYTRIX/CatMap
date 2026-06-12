import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia; lib/theme.js uses it to detect the
// OS color scheme preference.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
