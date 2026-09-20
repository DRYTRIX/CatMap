import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCat, faLocationDot, faTrash } from "@fortawesome/free-solid-svg-icons";
import {
  assetUrl,
  createAreaWatch,
  fetchCatProfile,
  fetchSighting,
  fetchWatches,
  unwatchTarget,
} from "../api";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";
import { useToast } from "./Toast";

const PAGE_SIZE = 50;

async function loadRow(watch) {
  if (watch.target_type === "area") return { watch, area: true };
  try {
    if (watch.target_type === "cat") {
      const cat = await fetchCatProfile(watch.target_id);
      const cover = cat.sightings?.[cat.sightings.length - 1];
      return {
        watch,
        title: cat.name || null,
        thumbnail_url: cover?.thumbnail_url,
        created_at: cover?.created_at || cat.created_at,
      };
    }
    const sighting = await fetchSighting(watch.target_id);
    return {
      watch,
      title: sighting.description,
      thumbnail_url: sighting.thumbnail_url,
      created_at: sighting.created_at,
    };
  } catch {
    return null;
  }
}

async function loadRows(watches) {
  const rows = await Promise.all(watches.map(loadRow));
  return rows.filter(Boolean);
}

/**
 * Bottom sheet listing everything the current identity is watching
 * (followed sightings + cat profiles), with pagination. Unwatching happens
 * via the bell toggle already on the sighting/cat detail sheet.
 *
 * Props: onClose, onSelect(sightingId), onCatSelect(catId).
 */
export default function WatchesModal({ onClose, onSelect, onCatSelect, getCenter }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [radius, setRadius] = useState("5");
  const [areaLabel, setAreaLabel] = useState("");
  const [savingArea, setSavingArea] = useState(false);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    fetchWatches({ limit: PAGE_SIZE, offset: 0 })
      .then(async (watches) => {
        const rows = await loadRows(watches);
        if (!active) return;
        setItems(rows);
        setHasMore(watches.length === PAGE_SIZE);
      })
      .catch((err) => {
        if (active) {
          setError(err.message || t("watches.loadError"));
          setItems([]);
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  function loadMore() {
    if (loadingMore || !items) return;
    setLoadingMore(true);
    fetchWatches({ limit: PAGE_SIZE, offset: items.length })
      .then(async (watches) => {
        const rows = await loadRows(watches);
        setItems((prev) => [...prev, ...rows]);
        setHasMore(watches.length === PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  async function addArea() {
    const c = getCenter?.();
    if (!c) return;
    setSavingArea(true);
    try {
      const watch = await createAreaWatch({
        lat: c.lat,
        lng: c.lng,
        radiusKm: Number(radius),
        label: areaLabel.trim(),
      });
      setItems((prev) => [{ watch, area: true }, ...(prev || [])]);
      setAreaLabel("");
      toast.success(t("watches.areaAdded"));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingArea(false);
    }
  }

  async function removeArea(row) {
    try {
      await unwatchTarget("area", row.watch.target_id);
      setItems((prev) => prev.filter((r) => r.watch.id !== row.watch.id));
    } catch (e) {
      toast.error(e.message);
    }
  }

  function open(row) {
    if (row.watch.target_type === "cat") {
      onCatSelect?.(row.watch.target_id);
    } else {
      onSelect?.(row.watch.target_id);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="watches-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="watches-title">🔔 {t("watches.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <section className="settings-section">
        <h3>{t("watches.areasTitle")}</h3>
        <p className="hint">{t("watches.areasHint")}</p>
        {(items || [])
          .filter((r) => r.area)
          .map((row) => (
            <div className="notif-row" key={row.watch.id}>
              <div className="sighting-list-item">
                <span className="sighting-list-thumb sighting-list-thumb-icon" aria-hidden="true">
                  <FontAwesomeIcon icon={faLocationDot} />
                </span>
                <div className="sighting-list-body">
                  <p className="sighting-list-desc">
                    {row.watch.label ||
                      `${row.watch.lat.toFixed(2)}, ${row.watch.lng.toFixed(2)}`}
                  </p>
                  <p className="sighting-list-meta">
                    {t("watches.areaRadius", { km: row.watch.radius_km })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="icon-btn notif-delete"
                aria-label={t("watches.areaRemove")}
                onClick={() => removeArea(row)}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          ))}
        {getCenter && (
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              value={areaLabel}
              maxLength={60}
              placeholder={t("watches.areaLabel")}
              aria-label={t("watches.areaLabel")}
              onChange={(e) => setAreaLabel(e.target.value)}
            />
            <select
              value={radius}
              aria-label={t("watches.areaRadiusLabel")}
              onChange={(e) => setRadius(e.target.value)}
            >
              {["1", "5", "10", "25"].map((km) => (
                <option key={km} value={km}>
                  {t("watches.areaRadius", { km })}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost" onClick={addArea} disabled={savingArea}>
              {t("watches.areaAdd")}
            </button>
          </div>
        )}
      </section>

      {items === null && (
        <>
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </>
      )}

      {error && <p className="error">{error}</p>}

      {items && !items.some((r) => !r.area) && !items.some((r) => r.area) && !error && (
        <div className="sighting-list-empty">{t("watches.empty")}</div>
      )}

      {items && items.some((r) => !r.area) && (
        <div className="sighting-list" role="list">
          {items.filter((r) => !r.area).map((row) => (
            <button
              key={row.watch.id}
              type="button"
              className="sighting-list-item"
              role="listitem"
              onClick={() => open(row)}
            >
              {row.thumbnail_url ? (
                <img
                  className="sighting-list-thumb"
                  src={assetUrl(row.thumbnail_url)}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="sighting-list-thumb sighting-list-thumb-icon" aria-hidden="true">
                  <FontAwesomeIcon icon={faCat} />
                </span>
              )}
              <div className="sighting-list-body">
                <p className="sighting-list-desc">{row.title || t("common.catSighting")}</p>
                <p className="sighting-list-meta">
                  {row.watch.target_type === "cat" ? t("watches.catProfile") : t("common.catSighting")}
                  {" · "}
                  {timeAgo(row.created_at)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? t("common.loading") : t("common.loadMore")}
        </button>
      )}
    </Modal>
  );
}
