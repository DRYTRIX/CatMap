import { useEffect, useState } from "react";
import {
  assetUrl,
  confirmSighting,
  deleteSighting,
  editSighting,
  fetchSighting,
  markGone,
  reportSighting,
} from "../api";
import { track } from "../analytics";
import { getConfirmedSet, isMine, markConfirmed } from "../deviceToken";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";
import Lightbox from "./Lightbox";
import LocationPicker from "./LocationPicker";
import { useToast } from "./Toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShare,
  faFlag,
  faTrash,
  faPen,
  faCat,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

const REPORT_REASONS = [
  { id: "not_a_cat", label: "Not a cat" },
  { id: "spam", label: "Spam" },
  { id: "wrong_location", label: "Wrong location" },
  { id: "duplicate", label: "Duplicate" },
  { id: "other", label: "Something else" },
];

/**
 * Bottom-sheet sighting detail. Hosts the photo (→ lightbox), confirm,
 * share, report, and (for the creator) edit / mark-gone / delete.
 *
 * Props: id, onClose, onChanged (called after edit/delete/gone/auto-hide so the
 * map refreshes).
 */
export default function SightingSheet({ id, onClose, onChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(getConfirmedSet().has(id));
  const [lightbox, setLightbox] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editLoc, setEditLoc] = useState(null);
  const mine = isMine(id);

  useEffect(() => {
    const source =
      new URLSearchParams(window.location.search).get("s") === id ? "deep_link" : "map";
    track("sighting_view", { source });

    let active = true;
    setData(null);
    setError(null);
    fetchSighting(id)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [id]);

  async function onConfirm() {
    setBusy(true);
    try {
      const res = await confirmSighting(id);
      setData((d) => ({ ...d, confirmations_count: res.confirmations }));
      setConfirmed(true);
      markConfirmed(id);
      if (!res.already_confirmed) {
        track("sighting_confirm");
        toast.success("Sighting confirmed!");
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    const url = `${window.location.origin}/s/${id}`;
    const title = data?.description
      ? `Cat on CatMap: ${data.description.slice(0, 80)}`
      : "Cat sighting on CatMap";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        track("sighting_share", { method: "native" });
      } else {
        await navigator.clipboard.writeText(url);
        track("sighting_share", { method: "clipboard" });
        toast.success("Link copied to clipboard.");
      }
    } catch {
      /* user cancelled share */
    }
  }

  async function submitReport(reason) {
    setReportOpen(false);
    setBusy(true);
    try {
      const res = await reportSighting(id, reason);
      if (res.hidden) {
        track("sighting_report", { outcome: "hidden", reason });
        toast.success("Reported — this sighting has been hidden.");
        onChanged?.();
        onClose();
      } else if (res.reported) {
        track("sighting_report", { outcome: "submitted", reason });
        toast.success("Thanks — your report was submitted.");
      } else {
        toast.info("You've already reported this one.");
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    setEditDesc(data.description || "");
    setEditLoc({ lat: data.lat, lng: data.lng });
    setEditing(true);
  }

  async function saveEdit() {
    setBusy(true);
    try {
      const updated = await editSighting(id, {
        description: editDesc,
        lat: editLoc?.lat,
        lng: editLoc?.lng,
      });
      setData(updated);
      setEditing(false);
      track("sighting_edit");
      toast.success("Sighting updated.");
      onChanged?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onMarkGone() {
    if (!window.confirm("Mark this cat as gone? It will be removed from the map.")) return;
    setBusy(true);
    try {
      await markGone(id);
      track("sighting_gone");
      toast.success("Marked as gone. Thanks for keeping the map fresh!");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete your sighting? This can't be undone.")) return;
    setBusy(true);
    try {
      await deleteSighting(id);
      track("sighting_delete");
      toast.success("Sighting deleted.");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="sheet-title" className="sheet detail-sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="sheet-title">🐱 Cat sighting</h2>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      {error && <div className="error">⚠️ {error}</div>}

      {!data && !error && (
        <>
          <div className="skeleton skeleton-img" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </>
      )}

      {data && (
        <>
          <button
            className="card-img-btn detail-img-btn"
            onClick={() => {
              track("sighting_photo_expand");
              setLightbox(true);
            }}
            aria-label="View full photo"
          >
            <img
              className={`card-img detail-img ${imgLoaded ? "is-loaded" : ""}`}
              src={assetUrl(data.thumbnail_url)}
              alt="Cat sighting"
              onLoad={() => setImgLoaded(true)}
            />
            <span className="card-img-zoom" aria-hidden="true">⛶</span>
          </button>

          {editing ? (
            <div className="field">
              <label htmlFor="edit-desc">Description</label>
              <textarea
                id="edit-desc"
                value={editDesc}
                maxLength={1000}
                onChange={(e) => setEditDesc(e.target.value)}
              />
              <label>Location</label>
              <LocationPicker value={editLoc} onChange={setEditLoc} />
              <div className="sheet-actions">
                <button
                  className="btn btn-primary"
                  onClick={saveEdit}
                  disabled={busy || !editLoc}
                >
                  Save changes
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setEditing(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {data.description && <p className="card-desc">{data.description}</p>}
              <div className="card-meta">
                🐱 Spotted {timeAgo(data.created_at)}
                {data.stale && <span className="stale-badge">may be outdated</span>}
              </div>

              <div className="confirm-row">
                <button
                  className="btn btn-primary btn-confirm"
                  onClick={onConfirm}
                  disabled={busy || confirmed}
                >
                  {confirmed ? "Confirmed ✓" : "Still here? Confirm"}
                </button>
                <span className="count">{data.confirmations_count}</span>
              </div>

              <div className="sheet-actions">
                <button className="btn btn-ghost" onClick={onShare} disabled={busy}>
                  <FontAwesomeIcon icon={faShare} /> Share
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setReportOpen(true)}
                  disabled={busy}
                >
                  <FontAwesomeIcon icon={faFlag} /> Report
                </button>
                {mine && (
                  <>
                    <button className="btn btn-ghost" onClick={startEdit} disabled={busy}>
                      <FontAwesomeIcon icon={faPen} /> Edit
                    </button>
                    <button className="btn btn-ghost" onClick={onMarkGone} disabled={busy}>
                      <FontAwesomeIcon icon={faCat} /> Gone
                    </button>
                    <button className="btn btn-danger" onClick={onDelete} disabled={busy}>
                      <FontAwesomeIcon icon={faTrash} /> Delete
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

      {lightbox && data && (
        <Lightbox
          src={assetUrl(data.photo_url)}
          alt="Cat sighting"
          onClose={() => setLightbox(false)}
        />
      )}

      {reportOpen && (
        <Modal
          onClose={() => setReportOpen(false)}
          labelledBy="report-title"
          className="sheet report-sheet"
        >
          <div className="wizard-head">
            <h2 id="report-title">Report this sighting</h2>
            <button
              className="icon-btn"
              aria-label="Close"
              onClick={() => setReportOpen(false)}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
          <p className="hint">Why are you reporting it?</p>
          <div className="report-reasons">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.id}
                className="btn btn-ghost btn-block"
                onClick={() => submitReport(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </Modal>
  );
}
