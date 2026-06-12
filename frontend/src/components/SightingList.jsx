import { assetUrl } from "../api";
import { timeAgo } from "../lib/time";

/**
 * Scrollable feed of sightings in the current map view, as an alternative to
 * the cluster map. Reuses the same dots already fetched by MapView.
 */
export default function SightingList({ dots, loadedOnce, onSelect }) {
  if (loadedOnce && dots.length === 0) {
    return (
      <div className="sighting-list-empty">
        No cats spotted in this area yet — be the first! 🐾
      </div>
    );
  }

  return (
    <div className="sighting-list" role="list">
      {dots.map((d) => (
        <button
          key={d.id}
          type="button"
          className="sighting-list-item"
          role="listitem"
          onClick={() => onSelect?.(d.id)}
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
  );
}
