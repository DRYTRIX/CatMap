import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { assetUrl, fetchRecent } from "../api";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";

/**
 * Bottom sheet browsing recent sightings worldwide.
 */
export default function RecentFeedModal({ onClose, onSelect }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("recent");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setItems(null);
    setError(null);

    fetchRecent({ limit: 30, sort }, controller.signal)
      .then((data) => {
        if (active) setItems(data);
      })
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
  }, [sort, t]);

  return (
    <Modal onClose={onClose} labelledBy="recent-feed-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="recent-feed-title">🌍 {t("recentFeed.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

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
                <p className="sighting-list-desc">{d.description || t("common.catSighting")}</p>
                <p className="sighting-list-meta">
                  🐱 {timeAgo(d.created_at)} · {t("common.confirmations", { count: d.confirmations_count })}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
