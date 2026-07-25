import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "./styles.css";
import "./i18n";
import App from "./App";
// Admin console is only reachable at /admin — keep its large bundle out of the
// initial download for regular users.
const AdminApp = lazy(() => import("./admin/AdminApp"));
import AnalyticsGate from "./components/AnalyticsGate";
import ErrorBoundary from "./components/ErrorBoundary";
import { initSentry } from "./sentry";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";

// Vite bundles CSS ourselves — don't inject FA styles twice.
config.autoAddCss = false;

initSentry();

const isAdmin = window.location.pathname.replace(/\/+$/, "") === "/admin";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isAdmin ? (
        <Suspense fallback={null}>
          <AdminApp />
        </Suspense>
      ) : (
        <AnalyticsGate>
          <App />
        </AnalyticsGate>
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
