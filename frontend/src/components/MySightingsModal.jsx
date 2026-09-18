import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { assetUrl, fetchMine } from "../api";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";

/**
 * Bottom sheet listing active sightings created by this device.
 */
const PAGE_SIZE = 50;

export default function MySightingsModal({ onClose, onSelect }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetchMine({ limit: PAGE_SIZE, offset: 0 }, controller.signal)
      .then((data) => {
        if (!active) return;
        setItems(data);
        setHasMore(data.length === PAGE_SIZE);
      })
      .catch((err) => {
        if (active && err.name !== "AbortError") {
          setError(err.message || t("mySightings.loadError"));
          setItems([]);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [t]);

  function loadMore() {
    if (loadingMore || !items) return;
    setLoadingMore(true);
    fetchMine({ limit: PAGE_SIZE, offset: items.length })
      .then((data) => {
        setItems((prev) => [...prev, ...data]);
        setHasMore(data.length === PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  return (
    <Modal onClose={onClose} labelledBy="my-sightings-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="my-sightings-title">🐱 {t("mySightings.title")}</h2>
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
        <div className="sighting-list-empty">{t("mySightings.empty")}</div>
      )}

      {items && items.length > 0 && (
        <div className="sighting-list" role="list">
          {items.map((d) => (
            <button
              key={d.id}
              type="button"
              className="sighting-list-item"
              role="listitem"
              onClick={() => onSelect(d.id)}
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
                  {d.kind === "missing" && (
                    <>
                      {" · "}
                      <span className="kind-badge kind-badge--missing">{t("sighting.missingBadge")}</span>
                    </>
                  )}
                  {d.status === "found" && (
                    <>
                      {" · "}
                      <span className="kind-badge kind-badge--found">{t("sighting.foundBadge")}</span>
                    </>
                  )}
                  {d.status === "pending" && (
                    <>
                      {" · "}
                      <span className="kind-badge kind-badge--pending">{t("sighting.pendingBadge")}</span>
                    </>
                  )}
                  {d.status === "gone" && (
                    <>
                      {" · "}
                      <span className="kind-badge">{t("sighting.goneBadge")}</span>
                    </>
                  )}
                  {d.status === "hidden" && (
                    <>
                      {" · "}
                      <span className="kind-badge">{t("sighting.hiddenBadge")}</span>
                    </>
                  )}
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
