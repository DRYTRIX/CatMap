import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { assetUrl, fetchSighting } from "../api";
import { getFavorites, onFavoritesChanged, removeFavorite } from "../lib/favorites";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";

/**
 * Bottom sheet listing the sightings saved to favorites (localStorage).
 * Fetches each sighting's current details; drops any that no longer exist.
 *
 * Props: onClose, onSelect(id) — opens that sighting's detail sheet.
 */
export default function FavoritesModal({ onClose, onSelect }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const ids = [...getFavorites()];
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            return await fetchSighting(id);
          } catch {
            removeFavorite(id);
            return null;
          }
        })
      );
      if (active) setItems(results.filter(Boolean));
    }

    load();
    const off = onFavoritesChanged(load);
    return () => {
      active = false;
      off();
    };
  }, []);

  return (
    <Modal onClose={onClose} labelledBy="favorites-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="favorites-title">❤️ Favorites</h2>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      {items === null && (
        <>
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </>
      )}

      {items?.length === 0 && (
        <div className="sighting-list-empty">
          No favorites yet — tap "Save" on a sighting to keep it here.
        </div>
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
                <p className="sighting-list-desc">{d.description || "Cat sighting"}</p>
                <p className="sighting-list-meta">
                  🐱 {timeAgo(d.created_at)} · {d.confirmations_count} confirmation
                  {d.confirmations_count === 1 ? "" : "s"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
