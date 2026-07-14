import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  assetUrl,
  confirmSighting,
  createCatProfile,
  deleteSighting,
  fetchSimilarSightings,
  fetchSighting,
  linkSightingToCat,
  markGone,
  reportSighting,
} from "../api";
import { track } from "../analytics";
import { shareSighting } from "../lib/share";
import { sightingShareUrl } from "../lib/publicUrl";
import { getConfirmedSet, isMine, markConfirmed } from "../deviceToken";
import { timeAgo } from "../lib/time";
import { isFavorite, toggleFavorite } from "../lib/favorites";
import Modal from "./Modal";
import Lightbox from "./Lightbox";
import EditSightingModal from "./EditSightingModal";
import AddPhotosModal from "./AddPhotosModal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShare,
  faFlag,
  faTrash,
  faPen,
  faCat,
  faXmark,
  faImages,
  faHeart as faHeartSolid,
} from "@fortawesome/free-solid-svg-icons";
import { faHeart as faHeartRegular } from "@fortawesome/free-regular-svg-icons";

// Mirrors MAX_PHOTOS_PER_SIGHTING in backend/app/routers/sightings.py.
const MAX_PHOTOS = 6;

const REPORT_REASON_IDS = ["not_a_cat", "spam", "wrong_location", "duplicate", "other"];

/**
 * Bottom-sheet sighting detail. Hosts the photo (→ lightbox), confirm,
 * share, report, and (for the creator) edit / mark-gone / delete.
 *
 * Props: id, onClose, onChanged (called after edit/delete/gone/auto-hide so the
 * map refreshes).
 */
export default function SightingSheet({ id, onClose, onChanged, onCatSelect }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(getConfirmedSet().has(id));
  const [activePhoto, setActivePhoto] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [favorite, setFavorite] = useState(() => isFavorite(id));
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similar, setSimilar] = useState(null);
  const [linking, setLinking] = useState(false);
  const mine = isMine(id);

  useEffect(() => {
    const source =
      new URLSearchParams(window.location.search).get("s") === id ? "deep_link" : "map";
    track("sighting_view", { source });

    let active = true;
    setData(null);
    setError(null);
    setActivePhoto(0);
    setFavorite(isFavorite(id));
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
        toast.success(t("sighting.confirmSuccess"));
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    const url = sightingShareUrl(id);
    const title = data?.description
      ? `Cat on CatMap: ${data.description.slice(0, 80)}`
      : "Cat sighting on CatMap";

    let file;
    try {
      const photoUrl = assetUrl(data?.photos?.[0]?.photo_url ?? data?.photo_url);
      const res = await fetch(photoUrl);
      const blob = await res.blob();
      file = new File([blob], "cat-sighting.jpg", { type: blob.type || "image/jpeg" });
    } catch {
      /* share link/title only */
    }

    try {
      const method = await shareSighting({ title, url, file });
      track("sighting_share", { method });
    } catch (e) {
      if (e?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        track("sighting_share", { method: "clipboard" });
        toast.success(t("sighting.linkCopied"));
      } catch {
        track("sighting_share", { method: "manual" });
        toast.info(url);
      }
    }
  }

  function onToggleFavorite() {
    const nowFavorite = toggleFavorite(id);
    setFavorite(nowFavorite);
    track("sighting_favorite", { favorite: nowFavorite });
    toast.success(nowFavorite ? t("sighting.favoriteAdded") : t("sighting.favoriteRemoved"));
  }

  async function submitReport(reason) {
    setReportOpen(false);
    setBusy(true);
    try {
      const res = await reportSighting(id, reason);
      if (res.hidden) {
        track("sighting_report", { outcome: "hidden", reason });
        toast.success(t("sighting.reportHidden"));
        onChanged?.();
        onClose();
      } else if (res.reported) {
        track("sighting_report", { outcome: "submitted", reason });
        toast.success(t("sighting.reportThanks"));
      } else {
        toast.info(t("sighting.reportAlready"));
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openSimilar() {
    setSimilarOpen(true);
    setSimilar(null);
    try {
      const items = await fetchSimilarSightings(id);
      setSimilar(items);
    } catch (e) {
      toast.error(e.message);
      setSimilar([]);
    }
  }

  async function linkToExisting(catId, sightingId) {
    setLinking(true);
    try {
      await linkSightingToCat(catId, sightingId);
      const updated = await fetchSighting(id);
      setData(updated);
      setSimilarOpen(false);
      toast.success(t("sighting.linkSuccess"));
      onChanged?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLinking(false);
    }
  }

  async function createProfileFromPair(otherId) {
    setLinking(true);
    try {
      const profile = await createCatProfile({ sightingIds: [id, otherId] });
      const updated = await fetchSighting(id);
      setData(updated);
      setSimilarOpen(false);
      toast.success(t("sighting.profileCreated"));
      onChanged?.();
      return profile.id;
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLinking(false);
    }
    return null;
  }

  async function linkToSighting(otherId) {
    if (data?.cat_id) {
      await linkToExisting(data.cat_id, otherId);
      return;
    }
    await createProfileFromPair(otherId);
  }

  async function onMarkGone() {
    setConfirmAction("gone");
  }

  async function onDelete() {
    setConfirmAction("delete");
  }

  async function handleConfirmAction() {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) return;

    setBusy(true);
    try {
      if (action === "gone") {
        await markGone(id);
        track("sighting_gone");
        toast.success(t("sighting.goneSuccess"));
        onChanged?.();
        onClose();
      } else if (action === "delete") {
        await deleteSighting(id);
        track("sighting_delete");
        toast.success(t("sighting.deleteSuccess"));
        onChanged?.();
        onClose();
      }
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="sheet-title" className="sheet detail-sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="sheet-title">🐱 {t("sighting.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
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
              src={assetUrl(data.photos[activePhoto]?.thumbnail_url ?? data.thumbnail_url)}
              alt="Cat sighting"
              onLoad={() => setImgLoaded(true)}
            />
            <span className="card-img-zoom" aria-hidden="true">⛶</span>
          </button>

          {data.photos.length > 1 && (
            <div className="photo-thumbs" role="list">
              {data.photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  className={`photo-thumb ${i === activePhoto ? "is-active" : ""}`}
                  aria-label={`Photo ${i + 1} of ${data.photos.length}`}
                  aria-current={i === activePhoto}
                  onClick={() => {
                    setActivePhoto(i);
                    setImgLoaded(false);
                  }}
                >
                  <img src={assetUrl(p.thumbnail_url)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          {data.description && <p className="card-desc">{data.description}</p>}

          {data.cat_id && (
            <div className="cat-profile-link">
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => onCatSelect?.(data.cat_id)}
              >
                <FontAwesomeIcon icon={faCat} /> {t("sighting.viewProfile")}
              </button>
            </div>
          )}

          <div className="card-meta">
            🐱 {t("sighting.spotted", { time: timeAgo(data.created_at) })}
            {data.stale && <span className="stale-badge">{t("sighting.stale")}</span>}
          </div>

              <div className="confirm-row">
                <button
                  className="btn btn-primary btn-confirm"
                  onClick={onConfirm}
                  disabled={busy || confirmed}
                >
                  {confirmed ? t("sighting.confirmed") : t("sighting.confirm")}
                </button>
                <span className="count">{data.confirmations_count}</span>
              </div>

          <div className="sheet-actions">
            <button
              className={`btn btn-ghost ${favorite ? "is-favorite" : ""}`}
              onClick={onToggleFavorite}
              aria-pressed={favorite}
            >
              <FontAwesomeIcon icon={favorite ? faHeartSolid : faHeartRegular} />{" "}
              {favorite ? t("sighting.saved") : t("sighting.save")}
            </button>
            <button className="btn btn-ghost" onClick={onShare} disabled={busy}>
              <FontAwesomeIcon icon={faShare} /> {t("sighting.share")}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setReportOpen(true)}
              disabled={busy}
            >
              <FontAwesomeIcon icon={faFlag} /> {t("sighting.report")}
            </button>
            {data.photos.length < MAX_PHOTOS && (
              <button
                className="btn btn-ghost"
                onClick={() => setAddingPhotos(true)}
                disabled={busy}
              >
                <FontAwesomeIcon icon={faImages} /> {t("sighting.addPhotos")}
              </button>
            )}
            {mine && (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={openSimilar}
                  disabled={busy || linking}
                >
                  <FontAwesomeIcon icon={faCat} /> {t("sighting.sameCat")}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setEditing(true)}
                  disabled={busy}
                >
                  <FontAwesomeIcon icon={faPen} /> {t("sighting.edit")}
                </button>
                <button className="btn btn-ghost" onClick={onMarkGone} disabled={busy}>
                  <FontAwesomeIcon icon={faCat} /> {t("sighting.gone")}
                </button>
                <button className="btn btn-danger" onClick={onDelete} disabled={busy}>
                  <FontAwesomeIcon icon={faTrash} /> {t("common.delete")}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {lightbox && data && (
        <Lightbox
          images={data.photos.map((p) => ({ src: assetUrl(p.photo_url), alt: "Cat sighting" }))}
          index={activePhoto}
          onNavigate={setActivePhoto}
          onClose={() => setLightbox(false)}
        />
      )}

      {editing && data && (
        <EditSightingModal
          data={data}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setData(updated);
            setEditing(false);
            onChanged?.();
          }}
        />
      )}

      {addingPhotos && data && (
        <AddPhotosModal
          sighting={data}
          remaining={MAX_PHOTOS - data.photos.length}
          onClose={() => setAddingPhotos(false)}
          onAdded={(updated) => {
            setData(updated);
            setActivePhoto(updated.photos.length - 1);
            setImgLoaded(false);
            setAddingPhotos(false);
          }}
        />
      )}

      {reportOpen && (
        <Modal
          onClose={() => setReportOpen(false)}
          labelledBy="report-title"
          className="sheet report-sheet"
        >
          <div className="wizard-head">
            <h2 id="report-title">{t("sighting.reportTitle")}</h2>
            <button
              className="icon-btn"
              aria-label="Close"
              onClick={() => setReportOpen(false)}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
          <p className="hint">{t("sighting.reportWhy")}</p>
          <div className="report-reasons">
            {REPORT_REASON_IDS.map((r) => (
              <button
                key={r}
                className="btn btn-ghost btn-block"
                onClick={() => submitReport(r)}
              >
                {t(`sighting.reasons.${r}`)}
              </button>
            ))}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={confirmAction === "gone"}
        title={t("sighting.goneTitle")}
        message={t("sighting.goneMessage")}
        confirmLabel={t("sighting.goneConfirm")}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        title={t("sighting.deleteTitle")}
        message={t("sighting.deleteMessage")}
        confirmLabel={t("common.delete")}
        danger
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      {similarOpen && (
        <Modal
          onClose={() => setSimilarOpen(false)}
          labelledBy="similar-title"
          className="sheet report-sheet"
        >
          <div className="wizard-head">
            <h2 id="similar-title">{t("sighting.similarTitle")}</h2>
            <button
              className="icon-btn"
              aria-label="Close"
              onClick={() => setSimilarOpen(false)}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
          <p className="hint">{t("sighting.similarHint")}</p>

          {similar === null && (
            <>
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </>
          )}

          {similar?.length === 0 && (
            <div className="sighting-list-empty">{t("sighting.similarEmpty")}</div>
          )}

          {similar && similar.length > 0 && (
            <div className="sighting-list" role="list">
              {similar.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="sighting-list-item"
                  role="listitem"
                  disabled={linking}
                  onClick={() => linkToSighting(s.id)}
                >
                  <img
                    className="sighting-list-thumb"
                    src={assetUrl(s.thumbnail_url)}
                    alt=""
                    loading="lazy"
                  />
                  <div className="sighting-list-body">
                    <p className="sighting-list-desc">{s.description || "Cat sighting"}</p>
                    <p className="sighting-list-meta">
                      🐱 {timeAgo(s.created_at)} · {t("sighting.linkSameCat")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </Modal>
  );
}
