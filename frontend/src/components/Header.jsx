import { useEffect, useState } from "react";
import SearchBar from "./SearchBar";
import { fetchStats } from "../api";
import { track } from "../analytics";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faPiggyBank } from "@fortawesome/free-solid-svg-icons";

function formatCount(n) {
  return n.toLocaleString();
}

/** Solid site header: brand + counts, search, and the Add action. */
export default function Header({ count, map, onAdd, donateURL }) {
  const [globalTotal, setGlobalTotal] = useState(null);

  useEffect(() => {
    let active = true;
    fetchStats()
      .then((data) => active && setGlobalTotal(data.total_cats))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="site-header">
      <div className="brand">
        <span className="brand-badge" aria-hidden="true">
          🐱
        </span>
        <span className="brand-name">CatMap</span>
        {globalTotal !== null && (
          <span className="brand-count brand-count-global">
            {formatCount(globalTotal)} cat{globalTotal === 1 ? "" : "s"} worldwide
          </span>
        )}
        {count !== null && (
          <span className="brand-count">
            {formatCount(count)} in view
          </span>
        )}
      </div>

      <SearchBar map={map} />
      <div className="header-actions">
        {donateURL && (
          <button
            type="button"
            className="btn btn-primary add-btn"
            onClick={() => {
              track("donate_click");
              window.open(donateURL, "_blank", "noopener,noreferrer");
            }}
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
