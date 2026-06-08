import SearchBar from "./SearchBar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faPiggyBank} from "@fortawesome/free-solid-svg-icons";
/** Solid site header: brand + live count, search, and the Add action. */
export default function Header({ count, map, onAdd, donateURL}) {
  return (
    <header className="site-header">
      <div className="brand">
        <span className="brand-badge" aria-hidden="true">🐱</span>
        <span className="brand-name">CatMap</span>
        {count !== null && (
          <span className="brand-count">
            {count} cat{count === 1 ? "" : "s"} here
          </span>
        )}
      </div>

      <SearchBar map={map} />
      <div className="header-actions">
        {donateURL && (
          <button
            type="button"
            className="btn btn-primary add-btn"
            onClick={() => window.open(donateURL, "_blank", "noopener,noreferrer")}
          >
            <span className="add-btn-plus" aria-hidden="true">
              <FontAwesomeIcon icon={faPiggyBank} />
            </span>
            <span className="add-btn-label">Donate</span>
          </button>
        )}
        <button type="button" className="btn btn-primary add-btn" onClick={onAdd}>
          <span className="add-btn-plus" aria-hidden="true">
            <FontAwesomeIcon icon={faPlus} />
          </span>
          <span className="add-btn-label">Add cat</span>
        </button>
      </div>
    </header>
  );
}
