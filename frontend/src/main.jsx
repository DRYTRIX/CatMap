import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "./styles.css";
import App from "./App";
import AnalyticsGate from "./components/AnalyticsGate";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";

// Vite bundles CSS ourselves — don't inject FA styles twice.
config.autoAddCss = false;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AnalyticsGate>
      <App />
    </AnalyticsGate>
  </React.StrictMode>
);
