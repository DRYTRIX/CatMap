import { useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { defaultIcon } from "../leafletIcon";
import { OSM_TILE_PROPS } from "../lib/osmTiles";
import { getPosition } from "../lib/geolocate";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
function ClickCapture({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPicker({ value, onChange }) {
  const [map, setMap] = useState(null);
  const [locating, setLocating] = useState(false);
  const center = value || { lat: 20, lng: 0 };
  const zoom = value ? 13 : 2;

  function useMyLocation() {
    setLocating(true);
    getPosition({ highAccuracy: true })
      .then((pos) => {
        const { latitude, longitude } = pos.coords;
        onChange({ lat: latitude, lng: longitude });
        if (map) map.setView([latitude, longitude], 15);
      })
      .finally(() => setLocating(false));
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="hint">Tap the map or drag the pin to set the location.</p>
        <button type="button" className="btn btn-ghost" onClick={useMyLocation}>
          {locating ? (
            "Locating…"
          ) : (
            <>
              <FontAwesomeIcon icon={faLocationDot} /> My location
            </>
          )}
        </button>
      </div>
      <div className="picker-map">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={zoom}
          style={{ height: "100%", width: "100%" }}
          ref={setMap}
        >
          <TileLayer {...OSM_TILE_PROPS} />
          <ClickCapture onPick={(lat, lng) => onChange({ lat, lng })} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              draggable
              icon={defaultIcon}
              eventHandlers={{
                dragend(e) {
                  const { lat, lng } = e.target.getLatLng();
                  onChange({ lat, lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      {value && (
        <p className="hint">
          Selected: {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      )}
    </div>
  );
}
