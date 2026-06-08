import { useEffect, useState } from "react";
import {
  assetUrl,
  confirmSighting,
  deleteSighting,
  fetchSighting,
  reportSighting,
} from "../api";
import { getConfirmedSet, isMine, markConfirmed } from "../deviceToken";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";
import Lightbox from "./Lightbox";
import { useToast } from "./Toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShare, faFlag, faTrash } from "@fortawesome/free-solid-svg-icons";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
/**
 * Bottom-sheet sighting detail. Hosts the photo (→ lightbox), confirm,
 * share, report, and (for the creator) delete.
 *
 * Props: id, onClose, onChanged (called after delete/auto-hide so the map refreshes).
 */
export default function SightingSheet({ id, onClose, onChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(getConfirmedSet().has(id));
  const [lightbox, setLightbox] = useState(false);
  const mine = isMine(id);

  useEffect(() => {
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
      if (!res.already_confirmed) toast.success("Sighting confirmed!");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    const url = `${window.location.origin}/?s=${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "CatMap sighting", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard.");
      }
    } catch {
      /* user cancelled share */
    }
  }

  async function onReport() {
    if (!window.confirm("Report this sighting as inappropriate or spam?")) return;
    setBusy(true);
    try {
      const res = await reportSighting(id);
      if (res.hidden) {
        toast.success("Reported — this sighting has been hidden.");
        onChanged?.();
        onClose();
      } else if (res.reported) {
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

  async function onDelete() {
    if (!window.confirm("Delete your sighting? This can't be undone.")) return;
    setBusy(true);
    try {
      await deleteSighting(id);
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
            onClick={() => setLightbox(true)}
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

          {data.description && <p className="card-desc">{data.description}</p>}
          <div className="card-meta">🐱 Spotted {timeAgo(data.created_at)}</div>

          <div className="confirm-row">
            <button
              className="btn btn-primary btn-confirm"
              onClick={onConfirm}
              disabled={busy || confirmed}
            >
              {confirmed ? "Confirmed ✓" : "Confirm sighting"}
            </button>
            <span className="count">{data.confirmations_count}</span>
          </div>

          <div className="sheet-actions">
            <button className="btn btn-ghost" onClick={onShare} disabled={busy}>
              <FontAwesomeIcon icon={faShare} /> Share
            </button>
            <button className="btn btn-ghost" onClick={onReport} disabled={busy}>
              <FontAwesomeIcon icon={faFlag} /> Report
            </button>
            {mine && (
              <button className="btn btn-danger" onClick={onDelete} disabled={busy}>
                <FontAwesomeIcon icon={faTrash} /> Delete
              </button>
            )}
          </div>
        </>
      )}

      {lightbox && data && (
        <Lightbox
          src={assetUrl(data.photo_url)}
          alt="Cat sighting"
          onClose={() => setLightbox(false)}
        />
      )}
    </Modal>
  );
}
