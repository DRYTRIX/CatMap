import { useCallback, useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { fetchDots } from "../api";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { catIcon, clusterIcon } from "../lib/markers";
import { OSM_TILE_PROPS } from "../lib/osmTiles";

function BoundsWatcher({ onChange }) {
  const map = useMapEvents({
    moveend: () => emit(),
    zoomend: () => emit(),
  });
  function emit() {
    const b = map.getBounds();
    onChange({
      minLat: b.getSouth(),
      maxLat: b.getNorth(),
      minLng: b.getWest(),
      maxLng: b.getEast(),
    });
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
  const [loadedOnce, setLoadedOnce] = useState(false);
  const bboxRef = useRef(null);
  const abortRef = useRef(null);

  const load = useCallback(
    async (bbox) => {
      if (!bbox) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const data = await fetchDots(bbox, controller.signal);
        setDots(data);
        setLoadedOnce(true);
        onCountChange?.(data.length);
      } catch (err) {
        // Ignore aborts; keep existing dots on transient errors.
        if (err.name !== "AbortError") {
          /* keep old dots */
        }
      }
    },
    [onCountChange]
  );

  const debouncedLoad = useDebouncedCallback(load, 350);

  // Reload immediately when a new sighting is posted.
  useEffect(() => {
    if (refreshKey > 0) load(bboxRef.current);
  }, [refreshKey, load]);

  return (
    <>
      <MapContainer
        center={[20, 0]}
        zoom={3}
        worldCopyJump
        zoomControl={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%" }}
        ref={onMapReady}
      >
        <TileLayer {...OSM_TILE_PROPS} />
        <GeolocateOnce />
        <BoundsWatcher
          onChange={(b) => {
            bboxRef.current = b;
            debouncedLoad(b);
          }}
        />
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
              icon={catIcon(d.confirmations_count)}
              eventHandlers={{ click: () => onSelect?.(d.id) }}
            />
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      {loadedOnce && dots.length === 0 && (
        <div className="empty-hint">
          No cats spotted in this area yet — be the first! 🐾
        </div>
      )}
    </>
  );
}
