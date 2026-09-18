import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClockRotateLeft, faHeart, faBell, faCat, faCompass } from "@fortawesome/free-solid-svg-icons";

/**
 * Persistent bottom navigation for every content-browsing screen — recent
 * feed, favorites, watches (followed sightings/cat profiles), your own
 * sightings, and the cat directory. The map's hamburger menu is reserved for
 * viewport tools (zoom, filter, list/map toggle) so there's one consistent
 * rule for where a given action lives.
 */
export default function BottomNav({ onRecent, onFavorites, onWatches, onMyCats, onCatDirectory }) {
  const { t } = useTranslation();

  const items = [
    { id: "recent", label: t("map.recent"), icon: faClockRotateLeft, onClick: onRecent },
    { id: "favorites", label: t("map.favorites"), icon: faHeart, onClick: onFavorites },
    { id: "watches", label: t("watches.title"), icon: faBell, onClick: onWatches },
    { id: "my-cats", label: t("map.myCats"), icon: faCat, onClick: onMyCats },
    { id: "cat-directory", label: t("map.catDirectory"), icon: faCompass, onClick: onCatDirectory },
  ];

  return (
    <nav className="bottom-nav" aria-label={t("bottomNav.label")}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="bottom-nav-item"
          aria-label={item.label}
          onClick={item.onClick}
        >
          <FontAwesomeIcon icon={item.icon} aria-hidden="true" />
          <span className="bottom-nav-item-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
