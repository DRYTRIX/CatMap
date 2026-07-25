import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { assetUrl, fetchRecent } from "../api";
import { getPosition } from "../lib/geolocate";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";
import { useToast } from "./Toast";

const TABS = [
  { id: "all", kind: "", status: "active" },
  { id: "sightings", kind: "sighting", status: "active" },
  { id: "missing", kind: "missing", status: "active" },
  { id: "reunited", kind: "missing", status: "found" },
];

export default function RecentFeedModal({ onClose, onSelect }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("recent");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [nearMe, setNearMe] = useState(false);
  const [nearCoords, setNearCoords] = useState(null);

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
      .then((pos) =>
        setNearCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      )
      .catch(() => {
        setNearMe(false);
        toast.error(t("map.locateError"));
      });
  }, [nearMe, toast, t]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setItems(null);
    setError(null);

    const tabCfg = TABS.find((x) => x.id === tab) || TABS[0];
    const params = {
      limit: 30,
      sort,
      kind: tabCfg.kind || undefined,
      status: tabCfg.status,
      q: debouncedQ || undefined,
    };
    if (nearCoords) {
      params.near_lat = nearCoords.lat;
      params.near_lng = nearCoords.lng;
      params.radius_km = 10;
    }

    fetchRecent(params, controller.signal)
      .then((data) => active && setItems(data))
      .catch((err) => {
        if (active && err.name !== "AbortError") {
          setError(err.message || t("recentFeed.loadError"));
          setItems([]);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [sort, tab, debouncedQ, nearCoords, t]);

  return (
    <Modal onClose={onClose} labelledBy="recent-feed-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="recent-feed-title">🌍 {t("recentFeed.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="recent-feed-tabs" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            className={`btn btn-sm ${tab === x.id ? "btn-primary" : "btn-ghost"}`}
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
          >
            {t(`recentFeed.tabs.${x.id}`)}
          </button>
        ))}
      </div>

      <input
        type="search"
        className="recent-feed-search"
        placeholder={t("recentFeed.searchPlaceholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="recent-feed-sort" role="group" aria-label={t("recentFeed.sortLabel")}>
        <button
          type="button"
          className={`btn btn-sm ${sort === "recent" ? "btn-primary" : "btn-ghost"}`}
          aria-pressed={sort === "recent"}
          onClick={() => setSort("recent")}
        >
          {t("recentFeed.recent")}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${sort === "confirmed" ? "btn-primary" : "btn-ghost"}`}
          aria-pressed={sort === "confirmed"}
          onClick={() => setSort("confirmed")}
        >
          {t("recentFeed.confirmed")}
        </button>
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
        <div className="sighting-list-empty">{t("recentFeed.empty")}</div>
      )}

      {items && items.length > 0 && (
        <div className="sighting-list" role="list">
          {items.map((d) => (
            <button
              key={d.id}
              type="button"
              className="sighting-list-item"
              role="listitem"
              onClick={() => {
                onSelect(d.id);
                onClose();
              }}
            >
              <img
                className="sighting-list-thumb"
                src={assetUrl(d.thumbnail_url)}
                alt=""
                loading="lazy"
              />
              <div className="sighting-list-body">
                <p className="sighting-list-desc">
                  {d.kind === "missing" && d.status !== "found" && (
                    <span className="kind-badge kind-badge--missing kind-badge--sm">
                      {t("sighting.missingBadge")}
                    </span>
                  )}
                  {d.description ||
                    (d.kind === "missing" ? t("sighting.titleMissing") : t("common.catSighting"))}
                </p>
                <p className="sighting-list-meta">
                  🐱 {timeAgo(d.created_at)} ·{" "}
                  {t("common.confirmations", { count: d.confirmations_count })}
                  {d.kind === "missing" && d.status === "found" && (
                    <> · {t("sighting.foundBadge")}</>
                  )}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
