import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import SearchBar from "./SearchBar";
import { fetchStats } from "../api";
import { track } from "../analytics";
import { getTheme, setTheme } from "../lib/theme";
import LanguageSwitcher from "./LanguageSwitcher";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faPiggyBank, faSun, faMoon, faBell, faGear } from "@fortawesome/free-solid-svg-icons";

function formatCount(n) {
  return n.toLocaleString();
}

/** Solid site header: brand + counts, search, and the Add action. */
export default function Header({
  count,
  map,
  onAdd,
  donateURL,
  refreshKey = 0,
  unreadCount = 0,
  queueCount = 0,
  onNotifications,
  onSettings,
}) {
  const { t } = useTranslation();
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
        <h1 className="brand-name">{t("header.brand")}</h1>
        {globalTotal !== null && (
          <span className="brand-count brand-count-global">
            {t("header.worldwide", { count: formatCount(globalTotal) })}
          </span>
        )}
        {count !== null && (
          <span className="brand-count">{t("header.inView", { count: formatCount(count) })}</span>
        )}
      </div>

      <SearchBar map={map} />
      <div className="header-actions">
        {queueCount > 0 && (
          <span className="queue-badge" title={t("header.pendingUploads")}>
            {queueCount}
          </span>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={t("notifications.title")}
          onClick={onNotifications}
        >
          <FontAwesomeIcon icon={faBell} />
          {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t("settings.title")}
          onClick={onSettings}
        >
          <FontAwesomeIcon icon={faGear} />
        </button>
        <LanguageSwitcher />
        <button
          type="button"
          className="icon-btn theme-toggle"
          aria-label={t("header.toggleTheme")}
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
            <span className="add-btn-label">{t("header.donate")}</span>
          </button>
        )}
        <button type="button" className="btn btn-primary add-btn" onClick={onAdd}>
          <span className="add-btn-plus" aria-hidden="true">
            <FontAwesomeIcon icon={faPlus} />
          </span>
          <span className="add-btn-label">{t("header.addCat")}</span>
        </button>
      </div>
    </header>
  );
}
