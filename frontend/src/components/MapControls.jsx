/** Grouped, consistently-styled on-map controls: zoom + locate + filter + view toggle. */
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faMinus,
  faLocationDot,
  faFilter,
  faList,
  faMap,
  faHeart,
} from "@fortawesome/free-solid-svg-icons";

export default function MapControls({
  map,
  onLocate,
  onFilter,
  onFavorites,
  activeFilterCount = 0,
  viewMode = "map",
  onToggleView,
}) {
  return (
    <div className="map-controls">
      {viewMode === "map" && (
        <>
          <button
            className="map-ctrl"
            aria-label="Zoom in"
            onClick={() => map?.zoomIn()}
            disabled={!map}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
          <button
            className="map-ctrl"
            aria-label="Zoom out"
            onClick={() => map?.zoomOut()}
            disabled={!map}
          >
            <FontAwesomeIcon icon={faMinus} />
          </button>
        </>
      )}
      <button
        className="map-ctrl map-ctrl-locate"
        aria-label="Center on my location"
        onClick={onLocate}
        disabled={!map}
      >
        <FontAwesomeIcon icon={faLocationDot} />
      </button>
      <button
        className="map-ctrl map-ctrl-filter"
        aria-label={`Filter cats${activeFilterCount ? ` (${activeFilterCount} active)` : ""}`}
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
        aria-label={viewMode === "map" ? "Switch to list view" : "Switch to map view"}
        onClick={onToggleView}
      >
        <FontAwesomeIcon icon={viewMode === "map" ? faList : faMap} />
      </button>
      <button className="map-ctrl" aria-label="Favorites" onClick={onFavorites}>
        <FontAwesomeIcon icon={faHeart} />
      </button>
    </div>
  );
}
