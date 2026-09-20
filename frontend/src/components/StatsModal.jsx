import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { exportUrl, fetchStatsDetail } from "../api";
import Modal from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

const WORLD = { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 };

function pct(v) {
  return v == null ? "–" : `${Math.round(v * 100)}%`;
}

export default function StatsModal({ onClose, getBounds }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);
  const [area, setArea] = useState("view");

  useEffect(() => {
    const controller = new AbortController();
    fetchStatsDetail(30, controller.signal)
      .then(setStats)
      .catch((e) => e.name !== "AbortError" && setError(true));
    return () => controller.abort();
  }, []);

  const bbox = (area === "view" && getBounds?.()) || WORLD;
  const series = stats?.sightings_by_day ?? [];
  const max = Math.max(1, ...series.map((p) => p.count));

  const tiles = stats
    ? [
        ["total", stats.total_cats],
        ["missing", stats.missing_active],
        ["reunited", stats.reunited],
        ["confirmations", stats.confirmations_total],
        ["earTipped", pct(stats.ear_tipped_share)],
        ["stray", pct(stats.stray_share)],
      ]
    : [];

  return (
    <Modal onClose={onClose} labelledBy="stats-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="stats-title">{t("stats.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      {error && <p className="error">{t("stats.loadError")}</p>}
      {!stats && !error && <div className="skeleton skeleton-line" />}

      {stats && (
        <>
          <dl className="stat-tiles">
            {tiles.map(([key, value]) => (
              <div className="stat-tile" key={key}>
                <dd>{value}</dd>
                <dt>{t(`stats.${key}`)}</dt>
              </div>
            ))}
          </dl>

          <h3>{t("stats.perDay")}</h3>
          <svg
            className="stat-bars"
            viewBox={`0 0 ${series.length * 10} 60`}
            preserveAspectRatio="none"
            role="img"
            aria-label={t("stats.perDayLabel", {
              count: series.reduce((sum, p) => sum + p.count, 0),
              days: series.length,
            })}
          >
            {series.map((p, i) => (
              <rect
                key={p.date}
                x={i * 10 + 1}
                width={8}
                y={60 - (p.count / max) * 58}
                height={(p.count / max) * 58}
                rx={1}
              >
                <title>{`${p.date}: ${p.count}`}</title>
              </rect>
            ))}
          </svg>
        </>
      )}

      <section className="settings-section">
        <h3>{t("stats.export")}</h3>
        <p className="hint">{t("stats.exportHint")}</p>
        <div className="field">
          <label htmlFor="export-area">{t("stats.exportArea")}</label>
          <select id="export-area" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="view">{t("stats.areaView")}</option>
            <option value="world">{t("stats.areaWorld")}</option>
          </select>
        </div>
        <div className="row">
          <a className="btn btn-ghost" href={exportUrl("geojson", bbox)} download>
            GeoJSON
          </a>
          <a className="btn btn-ghost" href={exportUrl("csv", bbox)} download>
            CSV
          </a>
        </div>
      </section>
    </Modal>
  );
}
