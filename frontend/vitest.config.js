import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Separate from vite.config.js so the PWA plugin (service worker injection,
// manifest generation) doesn't run during unit tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    css: false,
    // Needed for @testing-library/react's automatic afterEach(cleanup).
    globals: true,
    exclude: ["node_modules", "e2e"],
  },
});
