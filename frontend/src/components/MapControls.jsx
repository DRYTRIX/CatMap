/** Grouped, consistently-styled on-map controls: zoom + locate + browse. */
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faMinus, faLocationDot, faList } from "@fortawesome/free-solid-svg-icons";

export default function MapControls({ map, onLocate, onBrowse }) {
  return (
    <div className="map-controls">
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
      <button
        className="map-ctrl map-ctrl-locate"
        aria-label="Center on my location"
        onClick={onLocate}
        disabled={!map}
      >
        <FontAwesomeIcon icon={faLocationDot} />
      </button>
      <button className="map-ctrl" aria-label="Browse cats" onClick={onBrowse}>
        <FontAwesomeIcon icon={faList} />
      </button>
    </div>
  );
}
