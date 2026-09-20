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
const StatsModal = lazy(() => import("./components/StatsModal"));
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
import { getPosition, locateErrorKey } from "./lib/geolocate";
import { initNativeApp } from "./lib/nativeInit";
import { track } from "./analytics";
import { countActiveFilters, loadFilters, saveFilters } from "./lib/filters";
import { AuthProvider } from "./context/AuthContext";
import { migrateFavoritesToHearts } from "./lib/hearts";

// Every "screen" reachable via a shareable/bookmarkable `?screen=` URL param.
// Sighting/cat sheets (`s`/`c`) are handled separately since they can stack on
// top of one of these.
const SCREENS = new Set([
  "filter",
  "favorites",
  "mySightings",
  "recent",
  "reportIssue",
  "stats",
  "notifications",
  "settings",
  "account",
  "offlineQueue",
  "watches",
  "catDirectory",
]);

function AppShell() {
  const { t } = useTranslation();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [addAt, setAddAt] = useState(null); // pre-filled pin from the empty-map CTA
  const [refreshKey, setRefreshKey] = useState(0);
  const [count, setCount] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [filters, setFilters] = useState(loadFilters);
  const [screen, setScreen] = useState(null); // one of SCREENS, or null
  const [accountVerifyToken, setAccountVerifyToken] = useState(null);
  const [accountResetToken, setAccountResetToken] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [viewMode, setViewMode] = useState("map");
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  const mapRef = useRef(null);

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

  /** Open one of SCREENS as a new, navigable history entry. */
  function openScreen(name) {
    pushNav((params) => {
      params.set("screen", name);
      params.delete("s");
      params.delete("c");
    });
    setScreen(name);
  }

  /** Jump directly from one screen to another in place (e.g. Settings -> Account) without growing the back stack. */
  function switchScreen(name) {
    replaceNav((params) => {
      params.set("screen", name);
      params.delete("s");
      params.delete("c");
    });
    setScreen(name);
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
    setScreen(null);
    setSelectedCatId(null);
    setSelectedId(id);
  }

  function openCat(id) {
    pushNav((params) => {
      params.set("c", id);
      params.delete("s");
      params.delete("screen");
    });
    setScreen(null);
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
    setScreen(null);
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
    if (screen || selectedId || selectedCatId) {
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
      const next = params.get("screen");
      setScreen(SCREENS.has(next) ? next : null);
      setSelectedId(params.get("s"));
      setSelectedCatId(params.get("c"));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    track("app_open");

    // Normalize /s/{id} bookmarks to /?s={id} for the SPA.
    const pathMatch = window.location.pathname.match(/^\/s\/([^/]+)\/?$/);
    const params = new URLSearchParams(window.location.search);
    const id = pathMatch?.[1] ?? params.get("s");
    if (pathMatch) params.set("s", id);

    const catId = params.get("c");
    const screenParam = params.get("screen");
    const verify = params.get("verify");
    const reset = params.get("reset");

    if (id) {
      track("deep_link_open");
      setSelectedId(id);
    }
    if (catId) setSelectedCatId(catId);
    if (SCREENS.has(screenParam)) setScreen(screenParam);

    if (verify) {
      setAccountVerifyToken(verify);
      setScreen("account");
      params.delete("verify");
      params.set("screen", "account");
    } else if (reset) {
      setAccountResetToken(reset);
      setScreen("account");
      params.delete("reset");
      params.set("screen", "account");
    }

    if (pathMatch || id || catId || screenParam || verify || reset) {
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
    // Skip polling while the tab is hidden; catch up as soon as it's visible again.
    function refreshIfVisible() {
      if (document.visibilityState === "visible") refreshCounts();
    }
    refreshCounts();
    const id = setInterval(refreshIfVisible, 60_000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
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

  function openAddHere() {
    const m = mapRef.current;
    // Only pre-fill when zoomed in enough that the centre is a meaningful spot.
    if (m && m.getZoom() >= 10) {
      const c = m.getCenter();
      setAddAt({ lat: c.lat, lng: c.lng });
    }
    openAdd();
  }

  function closeAdd() {
    setAdding(false);
    setAddAt(null);
  }

  function locateMe() {
    if (!mapRef.current) return;
    track("map_locate");
    getPosition({ highAccuracy: false })
      .then((pos) =>
        mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 15)
      )
      .catch((err) => toast.error(t(locateErrorKey(err))));
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
          onAddHere={openAddHere}
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
        <AddSightingModal
          onClose={closeAdd}
          onCreated={handleCreated}
          initialLocation={addAt}
        />
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
          onOpenCat={openCat}
        />
      )}

      {screen === "filter" && (
        <FilterPanel
          value={filters}
          onApply={applyFilters}
          onClose={closeScreen}
        />
      )}

      {screen === "favorites" && (
        <FavoritesModal onClose={closeScreen} onSelect={openSighting} />
      )}

      {screen === "mySightings" && (
        <MySightingsModal onClose={closeScreen} onSelect={openSighting} />
      )}

      {screen === "recent" && (
        <RecentFeedModal onClose={closeScreen} onSelect={openSighting} />
      )}

      {screen === "stats" && (
        <StatsModal
          onClose={closeScreen}
          getBounds={() => {
            const b = mapRef.current?.getBounds();
            return b
              ? {
                  minLat: b.getSouth(),
                  maxLat: b.getNorth(),
                  minLng: b.getWest(),
                  maxLng: b.getEast(),
                }
              : null;
          }}
        />
      )}

      {screen === "reportIssue" && (
        <ReportIssueModal onClose={closeScreen} />
      )}

      {screen === "notifications" && (
        <NotificationsModal
          onClose={() => {
            closeScreen();
            fetchUnreadCount().then((r) => setUnreadCount(r.count)).catch(() => {});
          }}
          onSelectSighting={(id) => {
            openSighting(id);
            fetchUnreadCount().then((r) => setUnreadCount(r.count)).catch(() => {});
          }}
          onSelectCat={(id) => {
            openCat(id);
            fetchUnreadCount().then((r) => setUnreadCount(r.count)).catch(() => {});
          }}
        />
      )}

      {screen === "settings" && (
        <SettingsModal
          onClose={closeScreen}
          onReportIssue={() => switchScreen("reportIssue")}
          onOpenAccount={() => switchScreen("account")}
          onOpenStats={() => switchScreen("stats")}
        />
      )}

      {screen === "account" && (
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

      {screen === "offlineQueue" && (
        <OfflineQueueModal
          onClose={closeScreen}
          onFlushed={() => pendingCount().then(setQueueCount)}
        />
      )}

      {screen === "watches" && (
        <WatchesModal
          onClose={closeScreen}
          onSelect={openSighting}
          onCatSelect={openCat}
          getCenter={() => {
            const c = mapRef.current?.getCenter();
            return c ? { lat: c.lat, lng: c.lng } : null;
          }}
        />
      )}

      {screen === "catDirectory" && (
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
