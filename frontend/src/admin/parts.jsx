import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlassPlus } from "@fortawesome/free-solid-svg-icons";
import { adminImageObjectUrl } from "../api";

/**
 * Reported thumbnail loaded as a blob with the admin token in a header, so it
 * renders even for hidden/gone rows (the admin image route is token-gated).
 */
export function AdminThumb({ url, token, onClick, loading }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let objectUrl = null;
    let active = true;
    adminImageObjectUrl(url, token)
      .then((u) => {
        if (active) {
          objectUrl = u;
          setSrc(u);
        } else {
          URL.revokeObjectURL(u);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);

  const img = <img className="admin-thumb" src={src || undefined} alt="" loading="lazy" />;

  if (!onClick) return img;

  return (
    <button
      type="button"
      className={`admin-thumb-btn${loading ? " admin-thumb-btn--loading" : ""}`}
      onClick={onClick}
      disabled={loading}
      aria-label="View full image"
    >
      {img}
      <span className="admin-thumb-zoom" aria-hidden="true">
        <FontAwesomeIcon icon={faMagnifyingGlassPlus} />
      </span>
    </button>
  );
}

export function formatConfidence(c) {
  return c == null ? "—" : `${Math.round(c * 100)}%`;
}

export function formatBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function CapacityBar({ used, total }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const tone = pct > 90 ? "danger" : pct > 70 ? "warn" : null;
  return (
    <div className="admin-capacity">
      <div className="admin-capacity-head">
        <span className="admin-capacity-label">
          {formatBytes(used)} of {formatBytes(total)} used
        </span>
        <span className="admin-capacity-pct">{Math.round(pct)}%</span>
      </div>
      <div className="admin-capacity-track">
        <div
          className={`admin-capacity-fill${tone ? ` admin-capacity-fill--${tone}` : ""}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

export function MetricCard({ icon, label, value, caption, tone }) {
  return (
    <div className={`admin-stat-card${tone ? ` admin-stat-card--${tone}` : ""}`}>
      <span className="admin-stat-icon" aria-hidden="true">
        <FontAwesomeIcon icon={icon} />
      </span>
      <span className="admin-stat-value">{value}</span>
      <span className="admin-stat-label">{label}</span>
      {caption && <span className="admin-stat-caption">{caption}</span>}
    </div>
  );
}

export function TrendChart({ days }) {
  if (!days || days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="admin-trend">
      <div className="admin-trend-bars">
        {days.map((d) => (
          <div
            key={d.date}
            className="admin-trend-bar"
            title={`${d.date}: ${d.count} new sighting${d.count === 1 ? "" : "s"}`}
          >
            <div
              className="admin-trend-bar-fill"
              style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <p className="admin-trend-label">New sightings — last 14 days</p>
    </div>
  );
}

export function PanelHeader({ icon, title, count }) {
  return (
    <div className="admin-panel-header">
      <h2>
        <FontAwesomeIcon icon={icon} /> {title}
      </h2>
      {count != null && <span className="admin-panel-badge">{count}</span>}
    </div>
  );
}
