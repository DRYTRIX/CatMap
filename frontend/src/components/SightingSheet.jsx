import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  assetUrl,
  confirmSighting,
  createCatProfile,
  deleteSighting,
  deleteSightingPhoto,
  fetchSimilarSightings,
  fetchSighting,
  linkSightingToCat,
  markFound,
  relistSighting,
  markGone,
  reportSighting,
  reverseGeocode,
  unwatchTarget,
  watchTarget,
} from "../api";
import CommentThread from "./CommentThread";
import SightingPhotos from "./SightingPhotos";
import MissingCard from "./MissingCard";
import ReportSheet from "./ReportSheet";
import SimilarSheet from "./SimilarSheet";
// Lazy-loaded: pulls jspdf / html-to-image / qrcode / map compositor out of the
// main bundle — they only load when the user opens the poster.
const PosterModal = lazy(() => import("./PosterModal"));
import { track } from "../analytics";
import { shareSighting } from "../lib/share";
import { sightingShareUrl } from "../lib/publicUrl";
import { getConfirmedSet, markConfirmed, markCreated } from "../deviceToken";
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
  faFilePdf,
  faLocationDot,
  faBell,
  faBellSlash,
  faHeart as faHeartSolid,
} from "@fortawesome/free-solid-svg-icons";
import { faHeart as faHeartRegular } from "@fortawesome/free-regular-svg-icons";

// Mirrors MAX_PHOTOS_PER_SIGHTING in backend/app/routers/sightings.py.
const MAX_PHOTOS = 6;

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
  const [heartsCount, setHeartsCount] = useState(0);
  const [watching, setWatching] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [foundOutcome, setFoundOutcome] = useState("returned_home");
  const [foundStory, setFoundStory] = useState("");
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similar, setSimilar] = useState(null);
  const [linking, setLinking] = useState(false);
  const [address, setAddress] = useState(null);
  const [posterOpen, setPosterOpen] = useState(false);
  const mine = Boolean(data?.is_mine);

  useEffect(() => {
    const source =
      new URLSearchParams(window.location.search).get("s") === id ? "deep_link" : "map";
    track("sighting_view", { source });

    let active = true;
    setData(null);
    setError(null);
    setActivePhoto(0);
    setImgLoaded(false);
    setFavorite(isFavorite(id));
    setHeartsCount(0);
    setWatching(false);
    setConfirmed(getConfirmedSet().has(id));
    fetchSighting(id)
      .then((d) => {
        if (!active) return;
        setData(d);
        setWatching(Boolean(d.watching));
        setFavorite(Boolean(d.hearted) || isFavorite(id));
        setHeartsCount(Number(d.hearts_count) || 0);
        if (d.is_mine) markCreated(id);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [id]);

  // Reverse-geocode the pin to a readable place. Best-effort; the resolved
  // address is also handed to the poster so it isn't looked up twice.
  useEffect(() => {
    if (data?.lat == null || data?.lng == null) return;
    let active = true;
    setAddress(null);
    const ctrl = new AbortController();
    reverseGeocode(data.lat, data.lng, ctrl.signal)
      .then((place) => active && setAddress(place))
      .catch(() => {});
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [data?.lat, data?.lng]);

  async function onToggleWatch() {
    setBusy(true);
    try {
      if (watching) {
        await unwatchTarget("sighting", id);
        setWatching(false);
        toast.success(t("sighting.unwatchSuccess"));
      } else {
        await watchTarget("sighting", id);
        setWatching(true);
        toast.success(t("sighting.watchSuccess"));
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDeletePhoto(photoId) {
    if (photoId === "primary") return;
    setBusy(true);
    try {
      await deleteSightingPhoto(id, photoId);
      const updated = await fetchSighting(id);
      setData(updated);
      setActivePhoto(0);
      toast.success(t("sighting.photoDeleted"));
      onChanged?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

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
      ? t("sighting.shareTitle", { desc: data.description.slice(0, 80) })
      : t("sighting.shareTitleGeneric");

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

  async function onToggleFavorite() {
    try {
      const nowFavorite = await toggleFavorite(id);
      setFavorite(nowFavorite);
      setHeartsCount((c) => Math.max(0, c + (nowFavorite ? 1 : -1)));
      track("sighting_favorite", { favorite: nowFavorite });
      toast.success(nowFavorite ? t("sighting.favoriteAdded") : t("sighting.favoriteRemoved"));
      // Favorites also follow the pin so reconfirmations can notify.
      if (nowFavorite) {
        watchTarget("sighting", id)
          .then(() => setWatching(true))
          .catch(() => {});
      } else if (watching) {
        unwatchTarget("sighting", id)
          .then(() => setWatching(false))
          .catch(() => {});
      }
    } catch (e) {
      toast.error(e.message);
    }
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

  async function onMarkFound() {
    setConfirmAction("found");
  }

  async function onRelist() {
    setBusy(true);
    try {
      await relistSighting(id);
      track("sighting_relist");
      toast.success(t("sighting.relistSuccess"));
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
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
      } else if (action === "found") {
        await markFound(id, { outcome: foundOutcome, story: foundStory });
        track("sighting_found");
        toast.success(t("sighting.foundSuccess"));
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

  const isMissing = data?.kind === "missing";
  const isFound = data?.status === "found";
  const titleKey = isMissing ? "sighting.titleMissing" : "sighting.title";

  return (
    <Modal onClose={onClose} labelledBy="sheet-title" className="sheet detail-sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="sheet-title">🐱 {t(titleKey)}</h2>
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
          <SightingPhotos
            data={data}
            mine={mine}
            busy={busy}
            activePhoto={activePhoto}
            imgLoaded={imgLoaded}
            onSelectPhoto={(i) => {
              setActivePhoto(i);
              setImgLoaded(false);
            }}
            onImgLoad={() => setImgLoaded(true)}
            onExpand={() => {
              track("sighting_photo_expand");
              setLightbox(true);
            }}
            onDeletePhoto={onDeletePhoto}
          />

          {data.description && <p className="card-desc">{data.description}</p>}

          {isMissing && (
            <MissingCard data={data} sightingId={id} mine={mine} isFound={isFound} />
          )}

          {data.status === "pending" && (
            <p className="hint status-pending">{t("sighting.pendingStatus")}</p>
          )}
          {data.status === "gone" && (
            <p className="hint">{t("sighting.goneStatus")}</p>
          )}
          {data.status === "found" && data.found_outcome && (
            <p className="hint status-found">
              {t(`sighting.outcome.${data.found_outcome}`)}
              {data.found_story ? ` — ${data.found_story}` : ""}
            </p>
          )}
          {data.status === "hidden" && (
            <p className="hint">{t("sighting.hiddenStatus")}</p>
          )}

          {address && (
            <p className="sighting-address">
              <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />{" "}
              {isMissing
                ? t("sighting.lastSeenNear", { place: address })
                : t("sighting.near", { place: address })}
            </p>
          )}

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
            🐱{" "}
            {isMissing
              ? t("sighting.missingSince", { time: timeAgo(data.created_at) })
              : t("sighting.spotted", { time: timeAgo(data.created_at) })}
            {data.stale && <span className="stale-badge">{t("sighting.stale")}</span>}
          </div>

          {!isFound && (
              <div className="confirm-row">
                <button
                  className="btn btn-primary btn-confirm"
                  onClick={onConfirm}
                  disabled={busy || confirmed}
                >
                  {confirmed
                    ? t("sighting.confirmed")
                    : isMissing
                      ? t("sighting.confirmMissing")
                      : t("sighting.confirm")}
                </button>
                <span className="count">{data.confirmations_count}</span>
              </div>
              )}

          <CommentThread
            sightingId={id}
            isMissing={isMissing}
            canDeleteOwn={mine}
            showTipMap={isMissing}
            pinLat={data.lat}
            pinLng={data.lng}
            onChanged={onChanged}
          />

          <div className="sheet-actions">
            <button
              className={`btn btn-ghost ${favorite ? "is-favorite" : ""}`}
              onClick={onToggleFavorite}
              aria-pressed={favorite}
            >
              <FontAwesomeIcon icon={favorite ? faHeartSolid : faHeartRegular} />{" "}
              {favorite ? t("sighting.saved") : t("sighting.save")}
              {heartsCount > 0 ? ` · ${heartsCount}` : ""}
            </button>
            {!mine && !isFound && data.status === "active" && (
              <button
                className="btn btn-ghost"
                onClick={onToggleWatch}
                disabled={busy}
                aria-pressed={watching}
              >
                <FontAwesomeIcon icon={watching ? faBellSlash : faBell} />{" "}
                {watching ? t("sighting.watching") : t("sighting.watch")}
              </button>
            )}
            <button className="btn btn-ghost" onClick={onShare} disabled={busy}>
              <FontAwesomeIcon icon={faShare} /> {t("sighting.share")}
            </button>
            {isMissing && (
              <button
                className="btn btn-ghost"
                onClick={() => setPosterOpen(true)}
                disabled={busy}
              >
                <FontAwesomeIcon icon={faFilePdf} /> {t("sighting.poster")}
              </button>
            )}
            {!isFound && (
            <button
              className="btn btn-ghost"
              onClick={() => setReportOpen(true)}
              disabled={busy}
            >
              <FontAwesomeIcon icon={faFlag} /> {t("sighting.report")}
            </button>
            )}
            {!isFound && data.photos.length < MAX_PHOTOS && (
              <button
                className="btn btn-ghost"
                onClick={() => setAddingPhotos(true)}
                disabled={busy}
              >
                <FontAwesomeIcon icon={faImages} /> {t("sighting.addPhotos")}
              </button>
            )}
            {mine && !isFound && (
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
                {isMissing ? (
                  <button className="btn btn-ghost" onClick={onMarkFound} disabled={busy}>
                    <FontAwesomeIcon icon={faCat} /> {t("sighting.found")}
                  </button>
                ) : (
                  <button className="btn btn-ghost" onClick={onMarkGone} disabled={busy}>
                    <FontAwesomeIcon icon={faCat} /> {t("sighting.gone")}
                  </button>
                )}
                <button className="btn btn-danger" onClick={onDelete} disabled={busy}>
                  <FontAwesomeIcon icon={faTrash} /> {t("common.delete")}
                </button>
              </>
            )}
            {mine && (isFound || data.status === "gone") && (
              <button className="btn btn-ghost" onClick={onRelist} disabled={busy}>
                <FontAwesomeIcon icon={faCat} /> {t("sighting.relist")}
              </button>
            )}
            {mine && isFound && (
              <button className="btn btn-danger" onClick={onDelete} disabled={busy}>
                <FontAwesomeIcon icon={faTrash} /> {t("common.delete")}
              </button>
            )}
          </div>
        </>
      )}

      {lightbox && data && (
        <Lightbox
          images={data.photos.map((p) => ({ src: assetUrl(p.photo_url), alt: t("common.catSighting") }))}
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

      {posterOpen && data && (
        <Suspense fallback={null}>
          <PosterModal data={data} address={address} onClose={() => setPosterOpen(false)} />
        </Suspense>
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

      {reportOpen && <ReportSheet onClose={() => setReportOpen(false)} onSubmit={submitReport} />}

      <ConfirmDialog
        open={confirmAction === "gone"}
        title={t("sighting.goneTitle")}
        message={t("sighting.goneMessage")}
        confirmLabel={t("sighting.goneConfirm")}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "found"}
        title={t("sighting.foundTitle")}
        message={t("sighting.foundMessage")}
        confirmLabel={t("sighting.foundConfirm")}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      >
        <div className="field">
          <label htmlFor="found-outcome">{t("sighting.outcomeLabel")}</label>
          <select
            id="found-outcome"
            value={foundOutcome}
            onChange={(e) => setFoundOutcome(e.target.value)}
          >
            {["returned_home", "found_by_others", "deceased"].map((o) => (
              <option key={o} value={o}>
                {t(`sighting.outcome.${o}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="found-story">{t("sighting.storyLabel")}</label>
          <textarea
            id="found-story"
            rows={2}
            maxLength={500}
            value={foundStory}
            onChange={(e) => setFoundStory(e.target.value)}
          />
        </div>
      </ConfirmDialog>
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
        <SimilarSheet
          similar={similar}
          linking={linking}
          onClose={() => setSimilarOpen(false)}
          onPick={linkToSighting}
        />
      )}
    </Modal>
  );
}
