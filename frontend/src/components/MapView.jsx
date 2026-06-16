import { useCallback, useEffect, useRef, useState } from "react";
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
import { catIcon, clusterIcon, serverClusterIcon } from "../lib/markers";
import { OSM_TILE_PROPS } from "../lib/osmTiles";

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
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 13),
      () => {},
      { timeout: 8000 }
    );
  }, [map]);
  return null;
}

export default function MapView({ refreshKey, onMapReady, onCountChange, onSelect }) {
  const [dots, setDots] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const viewRef = useRef(null); // { bbox, zoom }
  const abortRef = useRef(null);
  const mapRef = useRef(null);

  const load = useCallback(
    async (bbox, zoom) => {
      if (!bbox) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        if (zoom < CLUSTER_ZOOM) {
          const data = await fetchClusters(bbox, zoom, controller.signal);
          setClusters(data);
          setDots([]);
          onCountChange?.(data.reduce((sum, c) => sum + c.count, 0));
        } else {
          const data = await fetchDots(bbox, controller.signal);
          setDots(data);
          setClusters([]);
          onCountChange?.(data.length);
        }
        setLoadedOnce(true);
      } catch (err) {
        // Ignore aborts; keep existing markers on transient errors.
        if (err.name !== "AbortError") {
          /* keep old markers */
        }
      }
    },
    [onCountChange]
  );

  const debouncedLoad = useDebouncedCallback(load, 350);

  // Reload immediately when a new sighting is posted.
  useEffect(() => {
    if (refreshKey > 0 && viewRef.current) {
      load(viewRef.current.bbox, viewRef.current.zoom);
    }
  }, [refreshKey, load]);

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
              eventHandlers={{
                click: () => {
                  const map = mapRef.current;
                  if (map) map.flyTo([c.lat, c.lng], CLUSTER_ZOOM);
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
            {dots.map((d) => (
              <Marker
                key={d.id}
                position={[d.lat, d.lng]}
                icon={catIcon(d.confirmations_count, d.stale)}
                eventHandlers={{ click: () => onSelect?.(d.id) }}
              />
            ))}
          </MarkerClusterGroup>
        )}
      </MapContainer>

      {isEmpty && (
        <div className="empty-hint">
          No cats spotted in this area yet — be the first! 🐾
        </div>
      )}
    </>
  );
}
