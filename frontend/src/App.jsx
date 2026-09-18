import { useTranslation } from "react-i18next";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import MapView from "./components/MapView";
import Header from "./components/Header";
import Footer from "./components/Footer";
import LoadingFallback from "./components/LoadingFallback";
import BottomNav from "./components/BottomNav";
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
const AccountModal = lazy(() => import("./components/AccountModal"));
const WatchesModal = lazy(() => import("./components/WatchesModal"));
const CatDirectoryModal = lazy(() => import("./components/CatDirectoryModal"));
import { markCreated } from "./deviceToken";
import { flushQueue, pendingCount } from "./lib/offlineQueue";
import { getPosition } from "./lib/geolocate";
import { initNativeApp } from "./lib/nativeInit";
import { track } from "./analytics";
import { countActiveFilters, loadFilters, saveFilters } from "./lib/filters";
import { AuthProvider } from "./context/AuthContext";
import { migrateFavoritesToHearts } from "./lib/hearts";

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
  const [showAccount, setShowAccount] = useState(false);
  const [accountVerifyToken, setAccountVerifyToken] = useState(null);
  const [accountResetToken, setAccountResetToken] = useState(null);
  const [showOfflineQueue, setShowOfflineQueue] = useState(false);
  const [showWatches, setShowWatches] = useState(false);
  const [showCatDirectory, setShowCatDirectory] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [viewMode, setViewMode] = useState("map");
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  const mapRef = useRef(null);

  // Every "screen" reachable via a shareable/bookmarkable `?screen=` URL param.
  // Sighting/cat sheets (`s`/`c`) are handled separately below since they can
  // stack on top of one of these.
  const SCREEN_NAMES = {
    filter: [filtering, setFiltering],
    favorites: [showFavorites, setShowFavorites],
    mySightings: [showMySightings, setShowMySightings],
    recent: [showRecent, setShowRecent],
    reportIssue: [showReportIssue, setShowReportIssue],
    notifications: [showNotifications, setShowNotifications],
    settings: [showSettings, setShowSettings],
    account: [showAccount, setShowAccount],
    offlineQueue: [showOfflineQueue, setShowOfflineQueue],
    watches: [showWatches, setShowWatches],
    catDirectory: [showCatDirectory, setShowCatDirectory],
  };

  function pushNav(mutate) {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    const qs = params.toString();
    window.history.pushState({ catmapNav: true }, "", qs ? `/?${qs}` : "/");
  }

  function replaceNav(mutate) {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    const qs = params.toString();
    window.history.replaceState({ catmapNav: true }, "", qs ? `/?${qs}` : "/");
  }

  /** Open one of SCREEN_NAMES as a new, navigable history entry. */
  function openScreen(name) {
    pushNav((params) => {
      params.set("screen", name);
      params.delete("s");
      params.delete("c");
    });
    SCREEN_NAMES[name][1](true);
  }

  /** Jump directly from one screen to another in place (e.g. Settings -> Account) without growing the back stack. */
  function switchScreen(name) {
    replaceNav((params) => {
      params.set("screen", name);
      params.delete("s");
      params.delete("c");
    });
    Object.entries(SCREEN_NAMES).forEach(([key, [, set]]) => set(key === name));
  }

  // Opening a sighting/cat sheet always takes over from whatever screen was
  // open (matches every call site: selecting an item in Favorites/Recent/
  // Watches/etc. is meant to replace that screen with the detail sheet, not
  // stack on top of it) — so this is the one place that both closes the
  // current screen and opens the sheet, as a single history push. Callers
  // must NOT also call onClose/closeScreen alongside these.
  function openSighting(id) {
    pushNav((params) => {
      params.set("s", id);
      params.delete("c");
      params.delete("screen");
    });
    Object.values(SCREEN_NAMES).forEach(([, set]) => set(false));
    setSelectedCatId(null);
    setSelectedId(id);
  }

  function openCat(id) {
    pushNav((params) => {
      params.set("c", id);
      params.delete("s");
      params.delete("screen");
    });
    Object.values(SCREEN_NAMES).forEach(([, set]) => set(false));
    setSelectedId(null);
    setSelectedCatId(id);
  }

  /** Close whatever screen/sheet is on top. Used as the onClose for every URL-synced modal. */
  function closeScreen() {
    if (window.history.state?.catmapNav) {
      window.history.back();
      return;
    }
    replaceNav((params) => {
      params.delete("screen");
      params.delete("s");
      params.delete("c");
    });
    Object.values(SCREEN_NAMES).forEach(([, set]) => set(false));
    setSelectedId(null);
    setSelectedCatId(null);
  }

  function handleBackButton() {
    if (adding) {
      setAdding(false);
      return true;
    }
    if (mapMenuOpen) {
      setMapMenuOpen(false);
      return true;
    }
    const anyScreenOpen = Object.values(SCREEN_NAMES).some(([v]) => v);
    if (anyScreenOpen || selectedId || selectedCatId) {
      window.history.back();
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

  // Reconcile screen/sighting/cat state from the URL whenever the user (or the
  // native back button, which falls back to window.history.back()) navigates.
  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const screen = params.get("screen");
      Object.entries(SCREEN_NAMES).forEach(([name, [, set]]) => set(name === screen));
      setSelectedId(params.get("s"));
      setSelectedCatId(params.get("c"));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // Intentionally mount-only: the setters captured here are stable across
    // renders (useState), so this doesn't need to re-run when SCREEN_NAMES'
    // *values* change on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    track("app_open");

    // Normalize /s/{id} bookmarks to /?s={id} for the SPA.
    const pathMatch = window.location.pathname.match(/^\/s\/([^/]+)\/?$/);
    const params = new URLSearchParams(window.location.search);
    const id = pathMatch?.[1] ?? params.get("s");
    if (pathMatch) params.set("s", id);

    const catId = params.get("c");
    const screen = params.get("screen");
    const verify = params.get("verify");
    const reset = params.get("reset");

    if (id) {
      track("deep_link_open");
      setSelectedId(id);
    }
    if (catId) setSelectedCatId(catId);
    if (screen && SCREEN_NAMES[screen]) SCREEN_NAMES[screen][1](true);

    if (verify) {
      setAccountVerifyToken(verify);
      setShowAccount(true);
      params.delete("verify");
      params.set("screen", "account");
    } else if (reset) {
      setAccountResetToken(reset);
      setShowAccount(true);
      params.delete("reset");
      params.set("screen", "account");
    }

    if (pathMatch || id || catId || screen || verify || reset) {
      const qs = params.toString();
      window.history.replaceState({ catmapNav: true }, "", qs ? `/?${qs}` : "/");
    }

    migrateFavoritesToHearts().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        onNotifications={() => openScreen("notifications")}
        onSettings={() => openScreen("settings")}
        onQueue={() => openScreen("offlineQueue")}
        onSelectSighting={openSighting}
      />

      <main className="map-wrap" id="map-root">
        <MapView
          refreshKey={refreshKey}
          filters={filters}
          viewMode={viewMode}
          onCountChange={setCount}
          onSelect={openSighting}
          onMapReady={(m) => {
            mapRef.current = m;
            if (m) setMapReady(true);
          }}
        />
        <MapControls
          map={map}
          onLocate={locateMe}
          onFilter={() => openScreen("filter")}
          activeFilterCount={countActiveFilters(filters)}
          viewMode={viewMode}
          onToggleView={toggleView}
          menuOpen={mapMenuOpen}
          onMenuOpenChange={setMapMenuOpen}
        />
      </main>

      <BottomNav
        onRecent={() => openScreen("recent")}
        onFavorites={() => openScreen("favorites")}
        onWatches={() => openScreen("watches")}
        onMyCats={() => openScreen("mySightings")}
        onCatDirectory={() => openScreen("catDirectory")}
      />

      <Footer />

      <Suspense fallback={<LoadingFallback />}>
      {adding && (
        <AddSightingModal onClose={closeAdd} onCreated={handleCreated} />
      )}

      {selectedId && (
        <SightingSheet
          id={selectedId}
          onClose={closeScreen}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onCatSelect={openCat}
        />
      )}

      {selectedCatId && (
        <CatProfileSheet
          id={selectedCatId}
          onClose={closeScreen}
          onSelectSighting={openSighting}
        />
      )}

      {filtering && (
        <FilterPanel
          value={filters}
          onApply={applyFilters}
          onClose={closeScreen}
        />
      )}

      {showFavorites && (
        <FavoritesModal onClose={closeScreen} onSelect={openSighting} />
      )}

      {showMySightings && (
        <MySightingsModal onClose={closeScreen} onSelect={openSighting} />
      )}

      {showRecent && (
        <RecentFeedModal onClose={closeScreen} onSelect={openSighting} />
      )}

      {showReportIssue && (
        <ReportIssueModal onClose={closeScreen} />
      )}

      {showNotifications && (
        <NotificationsModal
          onClose={() => {
            closeScreen();
            fetchUnreadCount().then((r) => setUnreadCount(r.count)).catch(() => {});
          }}
          onSelectSighting={(id) => {
            openSighting(id);
            fetchUnreadCount().then((r) => setUnreadCount(r.count)).catch(() => {});
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={closeScreen}
          onReportIssue={() => switchScreen("reportIssue")}
          onOpenAccount={() => switchScreen("account")}
        />
      )}

      {showAccount && (
        <AccountModal
          onClose={() => {
            closeScreen();
            setAccountVerifyToken(null);
            setAccountResetToken(null);
          }}
          verifyToken={accountVerifyToken}
          resetToken={accountResetToken}
        />
      )}

      {showOfflineQueue && (
        <OfflineQueueModal
          onClose={closeScreen}
          onFlushed={() => pendingCount().then(setQueueCount)}
        />
      )}

      {showWatches && (
        <WatchesModal
          onClose={closeScreen}
          onSelect={openSighting}
          onCatSelect={openCat}
        />
      )}

      {showCatDirectory && (
        <CatDirectoryModal onClose={closeScreen} onSelect={openCat} />
      )}
      </Suspense>

      <OnboardingHint />
      <InstallPrompt />
      <IdentityBackupBanner
        refreshKey={refreshKey}
        onBackup={() => openScreen("settings")}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ToastProvider>
  );
}
