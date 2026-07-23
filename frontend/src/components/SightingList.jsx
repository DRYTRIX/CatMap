import { useTranslation } from "react-i18next";
import { assetUrl } from "../api";
import { timeAgo } from "../lib/time";

/**
 * Scrollable feed of sightings in the current map view, as an alternative to
 * the cluster map. Reuses the same dots already fetched by MapView.
 */
export default function SightingList({ dots, loadedOnce, onSelect }) {
  const { t } = useTranslation();

  if (loadedOnce && dots.length === 0) {
    return <div className="sighting-list-empty">{t("map.emptyArea")}</div>;
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
            <p className="sighting-list-desc">
              {d.kind === "missing" && (
                <span className="kind-badge kind-badge--missing kind-badge--sm">
                  {t("sighting.missingBadge")}
                </span>
              )}
              {d.description || (d.kind === "missing" ? t("sighting.titleMissing") : t("common.catSighting"))}
            </p>
            <p className="sighting-list-meta">
              🐱 {timeAgo(d.created_at)} · {t("common.confirmations", { count: d.confirmations_count })}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
