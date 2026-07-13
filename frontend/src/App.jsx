import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import MapView from "./components/MapView";
import AddSightingModal from "./components/AddSightingModal";
import SightingSheet from "./components/SightingSheet";
import FilterPanel from "./components/FilterPanel";
import FavoritesModal from "./components/FavoritesModal";
import MySightingsModal from "./components/MySightingsModal";
import RecentFeedModal from "./components/RecentFeedModal";
import CatProfileSheet from "./components/CatProfileSheet";
import Header from "./components/Header";
import Footer from "./components/Footer";
import MapControls from "./components/MapControls";
import InstallPrompt from "./components/InstallPrompt";
import OnboardingHint from "./components/OnboardingHint";
import { ToastProvider, useToast } from "./components/Toast";
import { markCreated } from "./deviceToken";
import { getPosition } from "./lib/geolocate";
import { track } from "./analytics";
import { countActiveFilters, loadFilters, saveFilters } from "./lib/filters";

function AppShell() {
  const { t } = useTranslation();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [count, setCount] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [filters, setFilters] = useState(loadFilters);
  const [filtering, setFiltering] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showMySightings, setShowMySightings] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [viewMode, setViewMode] = useState("map");
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

    const catId = new URLSearchParams(window.location.search).get("c");
    if (catId) {
      setSelectedCatId(catId);
    }
  }, []);

  // Online/offline feedback.
  useEffect(() => {
    const onOffline = () => {
      track("connectivity_change", { status: "offline" });
      toast.error(t("connectivity.offline"));
    };
    const onOnline = () => {
      track("connectivity_change", { status: "online" });
      toast.success(t("connectivity.online"));
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [toast, t]);

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
    if (!mapRef.current) return;
    track("map_locate");
    getPosition({ highAccuracy: false })
      .then((pos) =>
        mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 15)
      )
      .catch(() => toast.error(t("map.locateError")));
  }

  function applyFilters(next) {
    setFilters(next);
    saveFilters(next);
  }

  function toggleView() {
    setViewMode((m) => {
      const next = m === "map" ? "list" : "map";
      track("view_toggle", { mode: next });
      return next;
    });
  }

  const map = mapReady ? mapRef.current : null;

  return (
    <div className="app">
      <Header count={count} map={map} onAdd={openAdd} refreshKey={refreshKey} donateURL="https://buymeacoffee.com/drytrix" />

      <main className="map-wrap">
        <MapView
          refreshKey={refreshKey}
          filters={filters}
          viewMode={viewMode}
          onCountChange={setCount}
          onSelect={setSelectedId}
          onMapReady={(m) => {
            mapRef.current = m;
            if (m) setMapReady(true);
          }}
        />
        <MapControls
          map={map}
          onLocate={locateMe}
          onFilter={() => setFiltering(true)}
          onFavorites={() => setShowFavorites(true)}
          onMySightings={() => setShowMySightings(true)}
          onRecent={() => setShowRecent(true)}
          activeFilterCount={countActiveFilters(filters)}
          viewMode={viewMode}
          onToggleView={toggleView}
        />
      </main>

      <Footer />

      {adding && (
        <AddSightingModal onClose={closeAdd} onCreated={handleCreated} />
      )}

      {selectedId && (
        <SightingSheet
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onCatSelect={(catId) => {
            setSelectedId(null);
            setSelectedCatId(catId);
          }}
        />
      )}

      {selectedCatId && (
        <CatProfileSheet
          id={selectedCatId}
          onClose={() => setSelectedCatId(null)}
          onSelectSighting={(sid) => {
            setSelectedCatId(null);
            setSelectedId(sid);
          }}
        />
      )}

      {filtering && (
        <FilterPanel
          value={filters}
          onApply={applyFilters}
          onClose={() => setFiltering(false)}
        />
      )}

      {showFavorites && (
        <FavoritesModal onClose={() => setShowFavorites(false)} onSelect={setSelectedId} />
      )}

      {showMySightings && (
        <MySightingsModal onClose={() => setShowMySightings(false)} onSelect={setSelectedId} />
      )}

      {showRecent && (
        <RecentFeedModal onClose={() => setShowRecent(false)} onSelect={setSelectedId} />
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
