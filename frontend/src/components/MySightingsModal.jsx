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
export default function MySightingsModal({ onClose, onSelect }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetchMine(controller.signal)
      .then((data) => {
        if (active) setItems(data);
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
