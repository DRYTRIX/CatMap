import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { defaultIcon } from "../leafletIcon";
import { OSM_TILE_PROPS } from "../lib/osmTiles";
import { getPosition } from "../lib/geolocate";
import { useToast } from "./Toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot, faSpinner } from "@fortawesome/free-solid-svg-icons";
function ClickCapture({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPicker({ value, onChange }) {
  const { t } = useTranslation();
  const toast = useToast();
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
      .catch(() => toast.error(t("map.locateError")))
      .finally(() => setLocating(false));
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="hint">{t("locationPicker.hint")}</p>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={useMyLocation}
          disabled={locating}
        >
          {locating ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin /> {t("locationPicker.locating")}
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faLocationDot} /> {t("locationPicker.myLocation")}
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
          {t("locationPicker.selected", {
            lat: value.lat.toFixed(5),
            lng: value.lng.toFixed(5),
          })}
        </p>
      )}
    </div>
  );
}
