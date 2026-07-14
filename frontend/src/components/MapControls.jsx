/** Grouped, consistently-styled on-map controls: zoom + locate + filter + view toggle. */
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
}) {
  const { t } = useTranslation();

  return (
    <div className="map-controls">
      {viewMode === "map" && (
        <>
          <button
            className="map-ctrl"
            aria-label={t("map.zoomIn")}
            onClick={() => map?.zoomIn()}
            disabled={!map}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
          <button
            className="map-ctrl"
            aria-label={t("map.zoomOut")}
            onClick={() => map?.zoomOut()}
            disabled={!map}
          >
            <FontAwesomeIcon icon={faMinus} />
          </button>
        </>
      )}
      <button
        className="map-ctrl map-ctrl-locate"
        aria-label={t("map.locate")}
        onClick={onLocate}
        disabled={!map}
      >
        <FontAwesomeIcon icon={faLocationDot} />
      </button>
      <button
        className="map-ctrl map-ctrl-filter"
        aria-label={
          activeFilterCount
            ? t("map.filterActive", { count: activeFilterCount })
            : t("map.filter")
        }
        onClick={onFilter}
      >
        <FontAwesomeIcon icon={faFilter} />
        {activeFilterCount > 0 && (
          <span className="map-ctrl-badge" aria-hidden="true">
            {activeFilterCount}
          </span>
        )}
      </button>
      <button
        className="map-ctrl"
        aria-label={viewMode === "map" ? t("map.listView") : t("map.mapView")}
        onClick={onToggleView}
      >
        <FontAwesomeIcon icon={viewMode === "map" ? faList : faMap} />
      </button>
      <button className="map-ctrl" aria-label={t("map.myCats")} onClick={onMySightings}>
        <FontAwesomeIcon icon={faCat} />
      </button>
      <button className="map-ctrl" aria-label={t("map.recent")} onClick={onRecent}>
        <FontAwesomeIcon icon={faClockRotateLeft} />
      </button>
      <button className="map-ctrl" aria-label={t("map.favorites")} onClick={onFavorites}>
        <FontAwesomeIcon icon={faHeart} />
      </button>
      <button className="map-ctrl" aria-label={t("map.reportIssue")} onClick={onReportIssue}>
        <FontAwesomeIcon icon={faBug} />
      </button>
    </div>
  );
}
