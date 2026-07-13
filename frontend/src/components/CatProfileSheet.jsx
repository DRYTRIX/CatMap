import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { assetUrl, fetchCatProfile } from "../api";
import { timeAgo } from "../lib/time";
import { OSM_TILE_PROPS } from "../lib/osmTiles";
import { catIcon } from "../lib/markers";
import Modal from "./Modal";

/**
 * Cat profile sheet: sightings timeline, photo strip, mini-map.
 *
 * Props: id, onClose, onSelectSighting(id)
 */
export default function CatProfileSheet({ id, onClose, onSelectSighting }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setData(null);
    setError(null);

    fetchCatProfile(id, controller.signal)
      .then((d) => active && setData(d))
      .catch((e) => {
        if (active && e.name !== "AbortError") setError(e.message);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id]);

  const center = data?.sightings?.length
    ? [
        data.sightings.reduce((sum, s) => sum + s.lat, 0) / data.sightings.length,
        data.sightings.reduce((sum, s) => sum + s.lng, 0) / data.sightings.length,
      ]
    : [20, 0];

  return (
    <Modal onClose={onClose} labelledBy="cat-profile-title" className="sheet detail-sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="cat-profile-title">🐱 {data?.name || "Cat profile"}</h2>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      {error && <div className="error">⚠️ {error}</div>}

      {!data && !error && (
        <>
          <div className="skeleton skeleton-img" />
          <div className="skeleton skeleton-line" />
        </>
      )}

      {data && (
        <>
          <div className="cat-profile-meta">
            <p>
              Spotted {data.sighting_count} time{data.sighting_count === 1 ? "" : "s"} · First seen{" "}
              {timeAgo(data.first_seen_at)} · Last seen {timeAgo(data.last_seen_at)}
            </p>
            {(data.color || data.is_ear_tipped != null || data.is_stray != null) && (
              <p className="hint">
                {data.color && <span>{data.color} · </span>}
                {data.is_ear_tipped != null && (
                  <span>Ear-tipped: {data.is_ear_tipped ? "yes" : "no"} · </span>
                )}
                {data.is_stray != null && <span>Stray: {data.is_stray ? "yes" : "no"}</span>}
              </p>
            )}
          </div>

          {data.sightings.length > 1 && (
            <div className="cat-profile-map">
              <MapContainer
                center={center}
                zoom={15}
                zoomControl={false}
                attributionControl={false}
                style={{ height: 140, width: "100%", borderRadius: 12 }}
              >
                <TileLayer {...OSM_TILE_PROPS} />
                {data.sightings.map((s) => (
                  <Marker
                    key={s.id}
                    position={[s.lat, s.lng]}
                    icon={catIcon(s.confirmations_count, false)}
                  />
                ))}
              </MapContainer>
            </div>
          )}

          <div className="sighting-list" role="list">
            {data.sightings.map((s) => (
              <button
                key={s.id}
                type="button"
                className="sighting-list-item"
                role="listitem"
                onClick={() => onSelectSighting?.(s.id)}
              >
                <img
                  className="sighting-list-thumb"
                  src={assetUrl(s.thumbnail_url)}
                  alt=""
                  loading="lazy"
                />
                <div className="sighting-list-body">
                  <p className="sighting-list-desc">{s.description || "Cat sighting"}</p>
                  <p className="sighting-list-meta">
                    🐱 {timeAgo(s.created_at)} · {s.confirmations_count} confirmation
                    {s.confirmations_count === 1 ? "" : "s"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
