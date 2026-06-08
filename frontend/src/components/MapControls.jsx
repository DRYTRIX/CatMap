/** Grouped, consistently-styled on-map controls: zoom + locate. */
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faMinus, faLocationDot } from "@fortawesome/free-solid-svg-icons";

export default function MapControls({ map, onLocate }) {
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
    </div>
  );
}
