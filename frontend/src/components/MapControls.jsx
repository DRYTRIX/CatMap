/** Compact on-map controls: locate + hamburger menu for secondary actions. */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faMinus,
  faLocationDot,
  faFilter,
  faList,
  faMap,
  faHeart,
  faCat,
  faClockRotateLeft,
  faBug,
  faBars,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

export default function MapControls({
  map,
  onLocate,
  onFilter,
  onFavorites,
  onMySightings,
  onRecent,
  onReportIssue,
  activeFilterCount = 0,
  viewMode = "map",
  onToggleView,
  menuOpen,
  onMenuOpenChange,
}) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = menuOpen ?? internalOpen;
  const setOpen = onMenuOpenChange ?? setInternalOpen;
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(e) {
      if (rootRef.current?.contains(e.target)) return;
      setOpen(false);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  function run(action) {
    setOpen(false);
    action?.();
  }

  const menuItems = [
    ...(viewMode === "map"
      ? [
          {
            id: "zoom-in",
            label: t("map.zoomIn"),
            icon: faPlus,
            onClick: () => map?.zoomIn(),
            disabled: !map,
          },
          {
            id: "zoom-out",
            label: t("map.zoomOut"),
            icon: faMinus,
            onClick: () => map?.zoomOut(),
            disabled: !map,
          },
        ]
      : []),
    {
      id: "filter",
      label: activeFilterCount
        ? t("map.filterActive", { count: activeFilterCount })
        : t("map.filter"),
      icon: faFilter,
      onClick: onFilter,
      badge: activeFilterCount,
    },
    {
      id: "view",
      label: viewMode === "map" ? t("map.listView") : t("map.mapView"),
      icon: viewMode === "map" ? faList : faMap,
      onClick: onToggleView,
    },
    {
      id: "my-cats",
      label: t("map.myCats"),
      icon: faCat,
      onClick: onMySightings,
    },
    {
      id: "recent",
      label: t("map.recent"),
      icon: faClockRotateLeft,
      onClick: onRecent,
    },
    {
      id: "favorites",
      label: t("map.favorites"),
      icon: faHeart,
      onClick: onFavorites,
    },
    {
      id: "report",
      label: t("map.reportIssue"),
      icon: faBug,
      onClick: onReportIssue,
    },
  ];

  return (
    <div className={`map-controls${open ? " is-menu-open" : ""}`} ref={rootRef}>
      <button
        className="map-ctrl map-ctrl-locate"
        aria-label={t("map.locate")}
        onClick={onLocate}
        disabled={!map}
      >
        <FontAwesomeIcon icon={faLocationDot} />
      </button>

      <button
        className={`map-ctrl map-ctrl-menu${open ? " is-open" : ""}`}
        aria-label={open ? t("map.closeMenu") : t("map.menu")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <FontAwesomeIcon icon={open ? faXmark : faBars} />
      </button>

      {open && (
        <div className="map-menu" role="menu">
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="map-menu-item"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => run(item.onClick)}
            >
              <span className="map-menu-icon">
                <FontAwesomeIcon icon={item.icon} />
                {item.badge > 0 && (
                  <span className="map-menu-badge" aria-hidden="true">
                    {item.badge}
                  </span>
                )}
              </span>
              <span className="map-menu-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
