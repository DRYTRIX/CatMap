import { useEffect, useRef, useState } from "react";
import MapView from "./components/MapView";
import AddSightingModal from "./components/AddSightingModal";
import SightingSheet from "./components/SightingSheet";
import Header from "./components/Header";
import Footer from "./components/Footer";
import MapControls from "./components/MapControls";
import InstallPrompt from "./components/InstallPrompt";
import { ToastProvider, useToast } from "./components/Toast";
import { markCreated } from "./deviceToken";

function AppShell() {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [count, setCount] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const mapRef = useRef(null);

  // Deep link: /?s=<id> opens that sighting directly (shareable links).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("s");
    if (id) setSelectedId(id);
  }, []);

  // Online/offline feedback.
  useEffect(() => {
    const onOffline = () => toast.error("You're offline — changes may not save.");
    const onOnline = () => toast.success("Back online.");
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [toast]);

  function handleCreated(sighting) {
    setAdding(false);
    markCreated(sighting.id);
    setRefreshKey((k) => k + 1);
    if (mapRef.current) mapRef.current.setView([sighting.lat, sighting.lng], 15);
  }

  function locateMe() {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 15),
      () => toast.error("Couldn't get your location."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const map = mapReady ? mapRef.current : null;

  return (
    <div className="app">
      <Header count={count} map={map} onAdd={() => setAdding(true)} donateURL="https://buymeacoffee.com/drytrix" />

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
        <AddSightingModal onClose={() => setAdding(false)} onCreated={handleCreated} />
      )}

      {selectedId && (
        <SightingSheet
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}

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
