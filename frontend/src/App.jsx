import { useTranslation } from "react-i18next";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import MapView from "./components/MapView";
import Header from "./components/Header";
import Footer from "./components/Footer";
import MapControls from "./components/MapControls";
import InstallPrompt from "./components/InstallPrompt";
import OnboardingHint from "./components/OnboardingHint";
import IdentityBackupBanner from "./components/IdentityBackupBanner";
import { ToastProvider, useToast } from "./components/Toast";
import { fetchUnreadCount } from "./api";

// Modals/sheets are only mounted when opened — code-split them so they stay out
// of the initial bundle.
const AddSightingModal = lazy(() => import("./components/AddSightingModal"));
const SightingSheet = lazy(() => import("./components/SightingSheet"));
const FilterPanel = lazy(() => import("./components/FilterPanel"));
const FavoritesModal = lazy(() => import("./components/FavoritesModal"));
const MySightingsModal = lazy(() => import("./components/MySightingsModal"));
const RecentFeedModal = lazy(() => import("./components/RecentFeedModal"));
const ReportIssueModal = lazy(() => import("./components/ReportIssueModal"));
const CatProfileSheet = lazy(() => import("./components/CatProfileSheet"));
const OfflineQueueModal = lazy(() => import("./components/OfflineQueueModal"));
const NotificationsModal = lazy(() => import("./components/NotificationsModal"));
const SettingsModal = lazy(() => import("./components/SettingsModal"));
import { markCreated } from "./deviceToken";
import { flushQueue, pendingCount } from "./lib/offlineQueue";
import { getPosition } from "./lib/geolocate";
import { initNativeApp } from "./lib/nativeInit";
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
  const [showReportIssue, setShowReportIssue] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOfflineQueue, setShowOfflineQueue] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [viewMode, setViewMode] = useState("map");
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  const mapRef = useRef(null);

  function handleBackButton() {
    if (adding) {
      setAdding(false);
      return true;
    }
    if (selectedId) {
      setSelectedId(null);
      return true;
    }
    if (selectedCatId) {
      setSelectedCatId(null);
      return true;
    }
    if (filtering) {
      setFiltering(false);
      return true;
    }
    if (showFavorites) {
      setShowFavorites(false);
      return true;
    }
    if (showMySightings) {
      setShowMySightings(false);
      return true;
    }
    if (showRecent) {
      setShowRecent(false);
      return true;
    }
    if (showReportIssue) {
      setShowReportIssue(false);
      return true;
    }
    if (showNotifications) {
      setShowNotifications(false);
      return true;
    }
    if (showSettings) {
      setShowSettings(false);
      return true;
    }
    if (showOfflineQueue) {
      setShowOfflineQueue(false);
      return true;
    }
    if (mapMenuOpen) {
      setMapMenuOpen(false);
      return true;
    }
    return false;
  }

  // Keep a ref to the latest handler so the native back-button listener is
  // registered once instead of being torn down/re-added on every modal toggle.
  const backHandlerRef = useRef(handleBackButton);
  backHandlerRef.current = handleBackButton;
  useEffect(
    () => initNativeApp({ onBackButton: () => backHandlerRef.current() }),
    []
  );

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

  useEffect(() => {
    function refreshCounts() {
      fetchUnreadCount()
        .then((r) => setUnreadCount(r.count))
        .catch(() => {});
      pendingCount()
        .then(setQueueCount)
        .catch(() => {});
    }
    refreshCounts();
    const id = setInterval(refreshCounts, 60_000);
    return () => clearInterval(id);
  }, [refreshKey]);

  useEffect(() => {
    function tryFlush() {
      flushQueue({
        onItemDone: () => {
          setRefreshKey((k) => k + 1);
          toast.success(t("offline.sent"));
        },
        onItemFailed: () => {
          toast.error(t("offline.failed"));
        },
      }).then(() => pendingCount().then(setQueueCount));
    }
    tryFlush();
    window.addEventListener("online", tryFlush);
    return () => window.removeEventListener("online", tryFlush);
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
      <Header
        count={count}
        map={map}
        onAdd={openAdd}
        refreshKey={refreshKey}
        donateURL="https://buymeacoffee.com/drytrix"
        unreadCount={unreadCount}
        queueCount={queueCount}
        onNotifications={() => setShowNotifications(true)}
        onSettings={() => setShowSettings(true)}
        onQueue={() => setShowOfflineQueue(true)}
        onSelectSighting={setSelectedId}
      />

      <main className="map-wrap" id="map-root">
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
          onReportIssue={() => setShowReportIssue(true)}
          activeFilterCount={countActiveFilters(filters)}
          viewMode={viewMode}
          onToggleView={toggleView}
          menuOpen={mapMenuOpen}
          onMenuOpenChange={setMapMenuOpen}
        />
      </main>

      <Footer />

      <Suspense fallback={null}>
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

      {showReportIssue && (
        <ReportIssueModal onClose={() => setShowReportIssue(false)} />
      )}

      {showNotifications && (
        <NotificationsModal
          onClose={() => {
            setShowNotifications(false);
            fetchUnreadCount().then((r) => setUnreadCount(r.count)).catch(() => {});
          }}
          onSelectSighting={(sid) => setSelectedId(sid)}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onReportIssue={() => {
            setShowSettings(false);
            setShowReportIssue(true);
          }}
        />
      )}

      {showOfflineQueue && (
        <OfflineQueueModal
          onClose={() => setShowOfflineQueue(false)}
          onFlushed={() => pendingCount().then(setQueueCount)}
        />
      )}
      </Suspense>

      <OnboardingHint />
      <InstallPrompt />
      <IdentityBackupBanner
        refreshKey={refreshKey}
        onBackup={() => setShowSettings(true)}
      />
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
