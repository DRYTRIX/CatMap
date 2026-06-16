import { useCallback, useEffect, useState } from "react";
import {
  adminDelete,
  adminHide,
  adminImageObjectUrl,
  adminListReports,
  adminUnhide,
  getAdminToken,
  setAdminToken,
} from "../api";
import { timeAgo } from "../lib/time";

/** Thumbnail fetched as a blob so the admin token stays in a header. */
function AdminThumb({ url }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let objectUrl = null;
    let active = true;
    adminImageObjectUrl(url)
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
  }, [url]);

  return (
    <div className="admin-thumb">
      {src ? <img src={src} alt="Reported sighting" /> : <span aria-hidden="true">🐱</span>}
    </div>
  );
}

function TokenGate({ onSubmit, error }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="admin-gate"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <h1>🐱 CatMap moderation</h1>
      <p className="hint">Enter the admin token to manage reported sightings.</p>
      <input
        type="password"
        autoComplete="off"
        placeholder="Admin token"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {error && <div className="error">⚠️ {error}</div>}
      <button className="btn btn-primary btn-block" type="submit" disabled={!value.trim()}>
        Unlock
      </button>
    </form>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(Boolean(getAdminToken()));
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await adminListReports();
      setRows(data);
    } catch (e) {
      setError(e.message);
      // Bad/expired token — drop it and show the gate again.
      setAdminToken("");
      setAuthed(false);
    }
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  function unlock(token) {
    setAdminToken(token);
    setError(null);
    setAuthed(true);
  }

  function signOut() {
    setAdminToken("");
    setAuthed(false);
    setRows(null);
  }

  async function act(id, fn, { remove = false } = {}) {
    setBusyId(id);
    try {
      const result = await fn(id);
      if (remove) {
        setRows((rs) => rs.filter((r) => r.id !== id));
      } else {
        // hide/unhide return the new status.
        setRows((rs) =>
          rs.map((r) => (r.id === id ? { ...r, status: result.status ?? r.status } : r))
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!authed) {
    return (
      <div className="admin-page admin-page--gate">
        <TokenGate onSubmit={unlock} error={error} />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>🐱 Reported sightings</h1>
        <div className="admin-header-actions">
          <button className="btn btn-ghost" onClick={load}>
            Refresh
          </button>
          <button className="btn btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {error && <div className="error">⚠️ {error}</div>}

      {rows === null && <p className="hint">Loading…</p>}
      {rows !== null && rows.length === 0 && (
        <p className="hint">No reported sightings. 🎉</p>
      )}

      {rows && rows.length > 0 && (
        <ul className="admin-list">
          {rows.map((r) => (
            <li key={r.id} className={`admin-row admin-row--${r.status}`}>
              <AdminThumb url={r.thumbnail_url} />
              <div className="admin-row-body">
                <p className="admin-row-desc">{r.description || <em>(no description)</em>}</p>
                <p className="admin-row-meta">
                  <span className={`admin-badge admin-badge--${r.status}`}>{r.status}</span>
                  {" · "}
                  {r.reports_count} report{r.reports_count === 1 ? "" : "s"}
                  {" · "}
                  {r.confirmations_count} confirmed
                  {" · "}
                  cat {r.cat_confidence == null ? "—" : `${Math.round(r.cat_confidence * 100)}%`}
                  {" · "}
                  {timeAgo(r.created_at)}
                </p>
                <p className="admin-row-coords">
                  {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                </p>
              </div>
              <div className="admin-row-actions">
                {r.status === "active" ? (
                  <button
                    className="btn btn-ghost"
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, adminHide)}
                  >
                    Hide
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost"
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, adminUnhide)}
                  >
                    Unhide
                  </button>
                )}
                <button
                  className="btn btn-danger"
                  disabled={busyId === r.id}
                  onClick={() => {
                    if (window.confirm("Permanently delete this sighting?")) {
                      act(r.id, adminDelete, { remove: true });
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
