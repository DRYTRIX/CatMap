import { useCallback, useEffect, useState } from "react";
import {
  adminApproveSighting,
  adminDeleteSighting,
  adminHideSighting,
  adminImageObjectUrl,
  adminUnhideSighting,
  fetchAdminActions,
  fetchAdminPending,
  fetchAdminReports,
} from "../api";
import { timeAgo } from "../lib/time";
import { ToastProvider, useToast } from "../components/Toast";

/**
 * Reported thumbnail loaded as a blob with the admin token in a header, so it
 * renders even for hidden/gone rows (the admin image route is token-gated).
 */
function AdminThumb({ url, token }) {
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
  return <img className="admin-thumb" src={src || undefined} alt="" loading="lazy" />;
}

const TOKEN_KEY = "catmap_admin_token";
const PAGE_SIZE = 25;
const ACTIONS_PAGE_SIZE = 10;

function formatConfidence(c) {
  return c == null ? "—" : `${Math.round(c * 100)}%`;
}

function AdminPanel() {
  const toast = useToast();
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "");
  const [tokenInput, setTokenInput] = useState("");
  const [rows, setRows] = useState(null);
  const [pending, setPending] = useState(null);
  const [actions, setActions] = useState(null);
  const [sort, setSort] = useState("reports");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await fetchAdminReports({ token, sort, limit: PAGE_SIZE, offset });
      setRows(data);
    } catch (e) {
      if (e.message === "UNAUTHORIZED") {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken("");
        setError("Invalid admin token.");
      } else {
        setError(e.message);
      }
    }
  }, [token, sort, offset]);

  const loadPending = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchAdminPending({ token });
      setPending(data);
    } catch {
      /* non-critical */
    }
  }, [token]);

  const loadActions = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchAdminActions({ token, limit: ACTIONS_PAGE_SIZE });
      setActions(data);
    } catch {
      /* non-critical; leave previous actions list in place */
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  function signIn(e) {
    e.preventDefault();
    sessionStorage.setItem(TOKEN_KEY, tokenInput);
    setToken(tokenInput);
    setTokenInput("");
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setRows(null);
  }

  async function act(label, action, id) {
    setBusyId(id);
    try {
      await action(id, token);
      toast.success(label);
      load();
      loadPending();
      loadActions();
    } catch (e) {
      if (e.message === "UNAUTHORIZED") {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken("");
        setError("Invalid admin token.");
      } else {
        toast.error(e.message);
      }
    } finally {
      setBusyId(null);
    }
  }

  if (!token) {
    return (
      <div className="admin-login">
        <form className="admin-login-card" onSubmit={signIn}>
          <h1>🐱 CatMap Admin</h1>
          {error && <div className="error">⚠️ {error}</div>}
          <label htmlFor="admin-token">Admin token</label>
          <input
            id="admin-token"
            type="password"
            autoComplete="current-password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary btn-block">
            Sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-app">
      <header className="admin-header">
        <h1>🐱 CatMap Admin</h1>
        <button className="btn btn-ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <h2 className="admin-section-title">
        Pending review{pending?.length > 0 ? ` (${pending.length})` : ""}
      </h2>
      {pending === null && <p>Loading…</p>}
      {pending?.length === 0 && <p>No sightings pending review.</p>}
      {pending && pending.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th></th>
                <th>Description</th>
                <th>Cat confidence</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td>
                    <AdminThumb url={r.thumbnail_url} token={token} />
                  </td>
                  <td className="admin-desc">{r.description || "—"}</td>
                  <td>{formatConfidence(r.cat_confidence)}</td>
                  <td>{timeAgo(r.created_at)}</td>
                  <td className="admin-actions">
                    <button
                      className="btn btn-primary"
                      disabled={busyId === r.id}
                      onClick={() => act("Sighting approved.", adminApproveSighting, r.id)}
                    >
                      Approve
                    </button>
                    <button
                      className="btn btn-danger"
                      disabled={busyId === r.id}
                      onClick={() => {
                        if (window.confirm("Permanently delete this sighting?")) {
                          act("Sighting deleted.", adminDeleteSighting, r.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="admin-section-title">Reports</h2>

      <div className="admin-controls">
        <label htmlFor="admin-sort">
          Sort by{" "}
          <select
            id="admin-sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setOffset(0);
            }}
          >
            <option value="reports">Most reported</option>
            <option value="date">Newest</option>
          </select>
        </label>
      </div>

      {error && <div className="error">⚠️ {error}</div>}

      {rows === null && <p>Loading…</p>}
      {rows?.length === 0 && <p>No reported sightings 🎉</p>}

      {rows && rows.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th></th>
                <th>Description</th>
                <th>Status</th>
                <th>Reports</th>
                <th>Confirms</th>
                <th>Cat confidence</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <AdminThumb url={r.thumbnail_url} token={token} />
                  </td>
                  <td className="admin-desc">{r.description || "—"}</td>
                  <td>
                    <span className={`admin-status admin-status--${r.status}`}>{r.status}</span>
                  </td>
                  <td>{r.reports_count}</td>
                  <td>{r.confirmations_count}</td>
                  <td>{formatConfidence(r.cat_confidence)}</td>
                  <td>{timeAgo(r.created_at)}</td>
                  <td className="admin-actions">
                    {r.status === "hidden" ? (
                      <button
                        className="btn btn-ghost"
                        disabled={busyId === r.id}
                        onClick={() => act("Sighting unhidden.", adminUnhideSighting, r.id)}
                      >
                        Unhide
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost"
                        disabled={busyId === r.id}
                        onClick={() => act("Sighting hidden.", adminHideSighting, r.id)}
                      >
                        Hide
                      </button>
                    )}
                    <button
                      className="btn btn-danger"
                      disabled={busyId === r.id}
                      onClick={() => {
                        if (window.confirm("Permanently delete this sighting?")) {
                          act("Sighting deleted.", adminDeleteSighting, r.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-pagination">
        <button
          className="btn btn-ghost"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          ← Prev
        </button>
        <span className="admin-page-info">Showing from #{offset + 1}</span>
        <button
          className="btn btn-ghost"
          disabled={!rows || rows.length < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next →
        </button>
      </div>

      <h2 className="admin-section-title">Recent moderation actions</h2>
      {actions === null && <p>Loading…</p>}
      {actions?.length === 0 && <p>No moderation actions yet.</p>}
      {actions && actions.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Sighting</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id}>
                  <td className="admin-status">{a.action}</td>
                  <td className="admin-desc">{a.sighting_id}</td>
                  <td>{timeAgo(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminApp() {
  return (
    <ToastProvider>
      <AdminPanel />
    </ToastProvider>
  );
}
