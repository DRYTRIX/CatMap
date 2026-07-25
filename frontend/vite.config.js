import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  // Restore Rollup-style CJS default interop for legacy packages (e.g. react-leaflet-cluster).
  legacy: {
    inconsistentCjsInterop: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Split the big statically-imported vendors into their own cacheable
        // chunks so app-code edits don't bust them and they load in parallel.
        // (onnxruntime, jspdf and html-to-image stay in their existing on-demand
        // async chunks — don't list them here or they'd be pulled forward.)
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("leaflet")) return "vendor-map";
          if (id.includes("@sentry")) return "vendor-sentry";
          if (id.includes("@fortawesome")) return "vendor-icons";
          if (id.includes("i18next")) return "vendor-i18n";
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    // Service worker is for the browser PWA only — not needed inside Capacitor WebView.
    mode !== "mobile" &&
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.js",
        registerType: "autoUpdate",
        injectRegister: "script",
        includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
        manifest: {
          name: "CatMap — Cat Sightings",
          short_name: "CatMap",
          description: "Anonymously geotag and confirm cat sightings worldwide.",
          theme_color: "#f59e0b",
          background_color: "#0f172a",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
          globIgnores: ["**/ort-*.wasm", "**/models/*.onnx"],
        },
      }),
  ].filter(Boolean),
  server: {
    host: true,
    port: 5173,
    // Same-origin /api in dev when VITE_API_BASE is unset (mirrors production nginx proxy).
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_PROXY || "http://localhost:8000",
        changeOrigin: true,
      },
      // Regex form so this only matches /s/{id} share-link paths, not /src/*
      // (a plain "/s" prefix would shadow every Vite module request).
      "^/s/": {
        target: process.env.VITE_DEV_API_PROXY || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
}));
