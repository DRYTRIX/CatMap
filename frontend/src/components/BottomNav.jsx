import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClockRotateLeft, faHeart, faBell } from "@fortawesome/free-solid-svg-icons";

/**
 * Persistent bottom navigation for the screens that were previously only
 * reachable through the map's hamburger menu — recent feed, favorites, and
 * watches (followed sightings/cat profiles).
 */
export default function BottomNav({ onRecent, onFavorites, onWatches }) {
  const { t } = useTranslation();

  const items = [
    { id: "recent", label: t("map.recent"), icon: faClockRotateLeft, onClick: onRecent },
    { id: "favorites", label: t("map.favorites"), icon: faHeart, onClick: onFavorites },
    { id: "watches", label: t("watches.title"), icon: faBell, onClick: onWatches },
  ];

  return (
    <nav className="bottom-nav" aria-label={t("bottomNav.label")}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="bottom-nav-item"
          onClick={item.onClick}
        >
          <FontAwesomeIcon icon={item.icon} aria-hidden="true" />
          <span className="bottom-nav-item-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
