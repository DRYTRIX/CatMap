import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCat } from "@fortawesome/free-solid-svg-icons";
import { assetUrl, fetchCatProfile, fetchSighting, fetchWatches } from "../api";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";

const PAGE_SIZE = 50;

async function loadRow(watch) {
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
export default function WatchesModal({ onClose, onSelect, onCatSelect }) {
  const { t } = useTranslation();
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

      {items === null && (
        <>
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </>
      )}

      {error && <p className="error">{error}</p>}

      {items?.length === 0 && !error && (
        <div className="sighting-list-empty">{t("watches.empty")}</div>
      )}

      {items && items.length > 0 && (
        <div className="sighting-list" role="list">
          {items.map((row) => (
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
