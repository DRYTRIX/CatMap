import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faBellSlash, faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  assetUrl,
  fetchCatProfile,
  renameCatProfile,
  unlinkSightingFromCat,
  unwatchTarget,
  watchTarget,
} from "../api";
import { timeAgo } from "../lib/time";
import { OSM_TILE_PROPS } from "../lib/osmTiles";
import { catIcon } from "../lib/markers";
import Modal from "./Modal";
import { useToast } from "./Toast";

/**
 * Cat profile sheet: sightings timeline, photo strip, mini-map, rename/unlink.
 *
 * Props: id, onClose, onSelectSighting(id)
 */
export default function CatProfileSheet({ id, onClose, onSelectSighting }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(false);

  function load(signal) {
    return fetchCatProfile(id, signal).then((d) => {
      setData(d);
      setNameDraft(d.name || "");
      setWatching(Boolean(d.watching));
    });
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setData(null);
    setError(null);

    load(controller.signal).catch((e) => {
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

  const trail = (data?.sightings || []).map((s) => [s.lat, s.lng]);

  async function onRename() {
    setBusy(true);
    try {
      const updated = await renameCatProfile(id, nameDraft.trim());
      setData(updated);
      toast.success(t("catProfile.renameSuccess"));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onUnlink(sightingId) {
    setBusy(true);
    try {
      const updated = await unlinkSightingFromCat(id, sightingId);
      setData(updated);
      toast.success(t("catProfile.unlinkSuccess"));
      if (!updated.sightings?.length) onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onToggleWatch() {
    setBusy(true);
    try {
      if (watching) {
        await unwatchTarget("cat", id);
        setWatching(false);
        toast.success(t("sighting.unwatchSuccess"));
      } else {
        await watchTarget("cat", id);
        setWatching(true);
        toast.success(t("sighting.watchSuccess"));
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="cat-profile-title" className="sheet detail-sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="cat-profile-title">🐱 {data?.name || t("catProfile.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
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
              {t("catProfile.summary", {
                count: data.sighting_count,
                first: timeAgo(data.first_seen_at),
                last: timeAgo(data.last_seen_at),
              })}
            </p>
            {(data.color || data.is_ear_tipped != null || data.is_stray != null) && (
              <p className="hint">
                {data.color && <span>{data.color} · </span>}
                {data.is_ear_tipped != null && (
                  <span>
                    {t("catProfile.earTipped", {
                      value: data.is_ear_tipped ? t("common.yes") : t("common.no"),
                    })}{" "}
                    ·{" "}
                  </span>
                )}
                {data.is_stray != null && (
                  <span>
                    {t("catProfile.stray", {
                      value: data.is_stray ? t("common.yes") : t("common.no"),
                    })}
                  </span>
                )}
              </p>
            )}
          </div>

          {data.is_mine ? (
            <div className="field cat-rename">
              <label htmlFor="cat-rename">{t("catProfile.rename")}</label>
              <div className="row">
                <input
                  id="cat-rename"
                  type="text"
                  value={nameDraft}
                  maxLength={50}
                  onChange={(e) => setNameDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={onRename}
                  disabled={busy}
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={onToggleWatch}
              disabled={busy}
              aria-pressed={watching}
            >
              <FontAwesomeIcon icon={watching ? faBellSlash : faBell} />{" "}
              {watching ? t("sighting.watching") : t("sighting.watch")}
            </button>
          )}

          {data.sightings.length > 0 && (
            <div className="cat-profile-map">
              <MapContainer
                center={center}
                zoom={15}
                zoomControl={false}
                attributionControl={false}
                style={{ height: 140, width: "100%", borderRadius: 12 }}
              >
                <TileLayer {...OSM_TILE_PROPS} />
                {trail.length > 1 && (
                  <Polyline positions={trail} pathOptions={{ color: "#2a6f6f", weight: 2 }} />
                )}
                {data.sightings.map((s) => (
                  <Marker
                    key={s.id}
                    position={[s.lat, s.lng]}
                    icon={catIcon(s.confirmations_count, false)}
                  />
                ))}
              </MapContainer>
              <p className="hint">{t("catProfile.timelineHint")}</p>
            </div>
          )}

          <div className="sighting-list" role="list">
            {data.sightings.map((s) => (
              <div key={s.id} className="sighting-list-item-wrap">
                <button
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
                    <p className="sighting-list-desc">{s.description || t("common.catSighting")}</p>
                    <p className="sighting-list-meta">
                      🐱 {timeAgo(s.created_at)} ·{" "}
                      {t("common.confirmations", { count: s.confirmations_count })}
                    </p>
                  </div>
                </button>
                {data.is_mine && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onUnlink(s.id)}
                    disabled={busy}
                  >
                    {t("catProfile.unlink")}
                  </button>
                )}
              </div>
            ))}
          </div>

          {data.sightings.length === 0 && (
            <div className="sighting-list-empty">{t("catProfile.empty")}</div>
          )}
        </>
      )}
    </Modal>
  );
}
