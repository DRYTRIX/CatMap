import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCat } from "@fortawesome/free-solid-svg-icons";
import { assetUrl, fetchCats } from "../api";
import { getPosition } from "../lib/geolocate";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";
import { useToast } from "./Toast";

const PAGE = 30;

/**
 * Bottom sheet for browsing/searching named cat profiles (repeat sightings
 * of the same individual), since profiles otherwise are only reachable by
 * first opening a sighting that happens to be linked to one.
 *
 * Props: onClose, onSelect(catId).
 */
export default function CatDirectoryModal({ onClose, onSelect }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [nearMe, setNearMe] = useState(false);
  const [nearCoords, setNearCoords] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const tmr = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(tmr);
  }, [query]);

  useEffect(() => {
    if (!nearMe) {
      setNearCoords(null);
      return;
    }
    getPosition({ highAccuracy: false })
      .then((pos) => setNearCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      .catch(() => {
        setNearMe(false);
        toast.error(t("map.locateError"));
      });
  }, [nearMe, toast, t]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedQ, nearCoords]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (offset === 0) {
      setItems(null);
      setError(null);
    }

    const params = { limit: PAGE, offset, q: debouncedQ || undefined };
    if (nearCoords) {
      params.near_lat = nearCoords.lat;
      params.near_lng = nearCoords.lng;
      params.radius_km = 25;
    }

    fetchCats(params, controller.signal)
      .then((data) => {
        if (!active) return;
        setHasMore(data.length >= PAGE);
        setItems((prev) => (offset === 0 ? data : [...(prev || []), ...data]));
      })
      .catch((err) => {
        if (active && err.name !== "AbortError") {
          setError(err.message || t("catDirectory.loadError"));
          if (offset === 0) setItems([]);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedQ, nearCoords, offset, t]);

  return (
    <Modal onClose={onClose} labelledBy="cat-directory-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="cat-directory-title">🐾 {t("catDirectory.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <input
        type="search"
        className="recent-feed-search"
        placeholder={t("catDirectory.searchPlaceholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="recent-feed-sort" role="group" aria-label={t("catDirectory.title")}>
        <label className="checkbox-row near-me-toggle">
          <input type="checkbox" checked={nearMe} onChange={(e) => setNearMe(e.target.checked)} />
          {t("recentFeed.nearMe")}
        </label>
      </div>

      {items === null && (
        <>
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </>
      )}

      {error && <p className="error">{error}</p>}

      {items?.length === 0 && !error && (
        <div className="sighting-list-empty">{t("catDirectory.empty")}</div>
      )}

      {items && items.length > 0 && (
        <div className="sighting-list" role="list">
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              className="sighting-list-item"
              role="listitem"
              onClick={() => {
                onSelect(c.id);
                onClose();
              }}
            >
              {c.thumbnail_url ? (
                <img
                  className="sighting-list-thumb"
                  src={assetUrl(c.thumbnail_url)}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="sighting-list-thumb sighting-list-thumb-icon" aria-hidden="true">
                  <FontAwesomeIcon icon={faCat} />
                </span>
              )}
              <div className="sighting-list-body">
                <p className="sighting-list-desc">{c.name || t("common.catSighting")}</p>
                <p className="sighting-list-meta">
                  {t("catDirectory.sightingCount", { count: c.sighting_count })} ·{" "}
                  {timeAgo(c.last_seen_at)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {hasMore && items && items.length > 0 && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => setOffset((o) => o + PAGE)}
        >
          {t("common.loadMore")}
        </button>
      )}
    </Modal>
  );
}
