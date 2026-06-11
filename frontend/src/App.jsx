import { useEffect, useRef, useState } from "react";
import MapView from "./components/MapView";
import AddSightingModal from "./components/AddSightingModal";
import SightingSheet from "./components/SightingSheet";
import Header from "./components/Header";
import Footer from "./components/Footer";
import MapControls from "./components/MapControls";
import InstallPrompt from "./components/InstallPrompt";
import OnboardingHint from "./components/OnboardingHint";
import { ToastProvider, useToast } from "./components/Toast";
import { markCreated } from "./deviceToken";
import { track } from "./analytics";

function AppShell() {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [count, setCount] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    track("app_open");

    // Normalize /s/{id} bookmarks to /?s={id} for the SPA.
    const pathMatch = window.location.pathname.match(/^\/s\/([^/]+)\/?$/);
    let id = pathMatch?.[1] ?? null;
    if (pathMatch) {
      const params = new URLSearchParams(window.location.search);
      params.set("s", id);
      const qs = params.toString();
      window.history.replaceState(null, "", `/?${qs}`);
    } else {
      id = new URLSearchParams(window.location.search).get("s");
    }

    if (id) {
      track("deep_link_open");
      setSelectedId(id);
    }
  }, []);

  // Online/offline feedback.
  useEffect(() => {
    const onOffline = () => {
      track("connectivity_change", { status: "offline" });
      toast.error("You're offline — changes may not save.");
    };
    const onOnline = () => {
      track("connectivity_change", { status: "online" });
      toast.success("Back online.");
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [toast]);

  function handleCreated(sighting, meta = {}) {
    track("add_sighting_complete", meta);
    setAdding(false);
    markCreated(sighting.id);
    setRefreshKey((k) => k + 1);
    if (mapRef.current) mapRef.current.setView([sighting.lat, sighting.lng], 15);
  }

  function openAdd() {
    track("add_sighting_start");
    setAdding(true);
  }

  function closeAdd() {
    setAdding(false);
  }

  function locateMe() {
    if (!navigator.geolocation || !mapRef.current) return;
    track("map_locate");
    navigator.geolocation.getCurrentPosition(
      (pos) => mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 15),
      () => toast.error("Couldn't get your location."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const map = mapReady ? mapRef.current : null;

  return (
    <div className="app">
      <Header count={count} map={map} onAdd={openAdd} donateURL="https://buymeacoffee.com/drytrix" />

      <div className="map-wrap">
        <MapView
          refreshKey={refreshKey}
          onCountChange={setCount}
          onSelect={setSelectedId}
          onMapReady={(m) => {
            mapRef.current = m;
            if (m) setMapReady(true);
          }}
        />
        <MapControls map={map} onLocate={locateMe} />
      </div>

      <Footer />

      {adding && (
        <AddSightingModal onClose={closeAdd} onCreated={handleCreated} />
      )}

      {selectedId && (
        <SightingSheet
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}

      <OnboardingHint />
      <InstallPrompt />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
