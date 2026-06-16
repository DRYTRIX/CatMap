import { useEffect, useState } from "react";
import SearchBar from "./SearchBar";
import { fetchStats } from "../api";
import { track } from "../analytics";
import { getTheme, setTheme } from "../lib/theme";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faPiggyBank, faSun, faMoon } from "@fortawesome/free-solid-svg-icons";

function formatCount(n) {
  return n.toLocaleString();
}

/** Solid site header: brand + counts, search, and the Add action. */
export default function Header({ count, map, onAdd, donateURL, refreshKey = 0 }) {
  const [globalTotal, setGlobalTotal] = useState(null);
  const [theme, setThemeState] = useState(getTheme);

  // Re-fetch when refreshKey changes (after a create/delete) so the worldwide
  // total stays in sync instead of going stale after the initial load.
  useEffect(() => {
    let active = true;
    fetchStats()
      .then((data) => active && setGlobalTotal(data.total_cats))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [refreshKey]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
    track("theme_toggle", { theme: next });
  }

  return (
    <header className="site-header">
      <div className="brand">
        <span className="brand-badge" aria-hidden="true">
          🐱
        </span>
        <h1 className="brand-name">CatMap</h1>
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
        <button
          type="button"
          className="icon-btn theme-toggle"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
        >
          <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} />
        </button>
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
