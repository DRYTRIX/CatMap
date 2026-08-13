import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroupImport from "react-leaflet-cluster";

// Vite 8 + "type":"module" can resolve CJS default exports as the module namespace.
const MarkerClusterGroup =
  MarkerClusterGroupImport?.default ?? MarkerClusterGroupImport;
import { fetchClusters, fetchDots } from "../api";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { getPosition } from "../lib/geolocate";
import { catIcon, clusterIcon, serverClusterIcon } from "../lib/markers";
import { OSM_TILE_PROPS } from "../lib/osmTiles";
import SightingList from "./SightingList";
import { useToast } from "./Toast";

// Below this zoom the server aggregates into a grid (counts everything, never
// drops dots); at or above it we fetch exact dots and cluster them client-side.
const CLUSTER_ZOOM = 12;

function BoundsWatcher({ onChange }) {
  const map = useMapEvents({
    moveend: () => emit(),
    zoomend: () => emit(),
  });
  function emit() {
    const b = map.getBounds();
    onChange(
      {
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLng: b.getWest(),
        maxLng: b.getEast(),
      },
      map.getZoom()
    );
  }
  useEffect(() => emit(), []); // eslint-disable-line
  return null;
}

// One-shot geolocate on first load to center on the user. Defined at module
// scope so it isn't remounted (and re-triggered) on every MapView render.
function GeolocateOnce() {
  const map = useMap();
  useEffect(() => {
    getPosition({ highAccuracy: false })
      .then((pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 13))
      .catch(() => {});
  }, [map]);
  return null;
}

export default function MapView({
  refreshKey,
  filters,
  viewMode = "map",
  onMapReady,
  onCountChange,
  onSelect,
}) {
  const [dots, setDots] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const viewRef = useRef(null); // { bbox, zoom }
  const abortRef = useRef(null);
  const mapRef = useRef(null);
  const loadErrorShownRef = useRef(false);
  const toast = useToast();
  const { t } = useTranslation();

  const load = useCallback(
    async (bbox, zoom) => {
      if (!bbox) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        // The list view always needs individual sightings; the map aggregates
        // into server-side clusters when zoomed out so no dots are dropped.
        if (viewMode !== "list" && zoom < CLUSTER_ZOOM) {
          const data = await fetchClusters(bbox, zoom, filters, controller.signal);
          setClusters(data);
          setDots([]);
          onCountChange?.(data.reduce((sum, c) => sum + c.count, 0));
        } else {
          const data = await fetchDots(bbox, filters, controller.signal);
          setDots(data);
          setClusters([]);
          onCountChange?.(data.length);
        }
        setLoadedOnce(true);
        loadErrorShownRef.current = false;
      } catch (err) {
        // Ignore aborts; keep existing markers on transient errors.
        if (err.name !== "AbortError") {
          if (!loadErrorShownRef.current) {
            loadErrorShownRef.current = true;
            toast.error(t("map.fetchError"));
          }
        }
      }
    },
    [filters, viewMode, onCountChange, toast, t]
  );

  const debouncedLoad = useDebouncedCallback(load, 350);

  // Reload immediately when a new sighting is posted, or when filters change.
  useEffect(() => {
    if (refreshKey > 0 && viewRef.current) {
      load(viewRef.current.bbox, viewRef.current.zoom);
    }
  }, [refreshKey, load]);

  // Reload when filters change or the map/list view toggles.
  useEffect(() => {
    if (viewRef.current) load(viewRef.current.bbox, viewRef.current.zoom);
  }, [filters, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when the tab regains visibility/focus, so changes made elsewhere
  // (e.g. an admin deleting a cat on /admin, or a sighting added in another tab)
  // are reflected without a manual reload.
  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState === "visible" && viewRef.current) {
        load(viewRef.current.bbox, viewRef.current.zoom);
      }
    }
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [load]);

  const isEmpty = loadedOnce && dots.length === 0 && clusters.length === 0;

  return (
    <>
      <MapContainer
        center={[20, 0]}
        zoom={3}
        worldCopyJump
        zoomControl={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%" }}
        ref={(m) => {
          mapRef.current = m;
          onMapReady?.(m);
        }}
      >
        <TileLayer {...OSM_TILE_PROPS} />
        <GeolocateOnce />
        <BoundsWatcher
          onChange={(bbox, zoom) => {
            viewRef.current = { bbox, zoom };
            debouncedLoad(bbox, zoom);
          }}
        />

        {clusters.length > 0 &&
          clusters.map((c) => (
            <Marker
              key={`c-${c.lat}-${c.lng}`}
              position={[c.lat, c.lng]}
              icon={serverClusterIcon(c.count)}
              title={t("map.clusterCount", { count: c.count })}
              alt={t("map.clusterCount", { count: c.count })}
              eventHandlers={{
                click: () => {
                  const map = mapRef.current;
                  if (!map) return;
                  // Drill in toward the cluster's centroid; big cells split into
                  // smaller clusters/dots over the actual cats instead of jumping
                  // to a fixed zoom over empty space.
                  const next = Math.min(map.getZoom() + 3, CLUSTER_ZOOM + 2);
                  map.flyTo([c.lat, c.lng], next);
                },
              }}
            />
          ))}

        {dots.length > 0 && (
          <MarkerClusterGroup
            chunkedLoading
            showCoverageOnHover={false}
            maxClusterRadius={50}
            iconCreateFunction={clusterIcon}
          >
            {dots.map((d) => {
              const label =
                (d.description || "").trim() ||
                (d.kind === "missing"
                  ? t("sighting.titleMissing")
                  : t("common.catSighting"));
              return (
                <Marker
                  key={d.id}
                  position={[d.lat, d.lng]}
                  icon={catIcon(d.confirmations_count, d.stale, d.kind)}
                  title={label}
                  alt={label}
                  eventHandlers={{ click: () => onSelect?.(d.id) }}
                />
              );
            })}
          </MarkerClusterGroup>
        )}
      </MapContainer>

      {viewMode === "list" ? (
        <SightingList dots={dots} loadedOnce={loadedOnce} onSelect={onSelect} />
      ) : (
        isEmpty && <div className="empty-hint">{t("map.emptyArea")}</div>
      )}
    </>
  );
}
