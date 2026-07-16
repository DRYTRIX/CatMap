import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createComment,
  deleteComment,
  fetchComments,
  reportComment,
} from "../api";
import { getPosition } from "../lib/geolocate";
import { timeAgo } from "../lib/time";
import LocationPicker from "./LocationPicker";
import { useToast } from "./Toast";

export default function CommentThread({ sightingId, isMissing, canDeleteOwn, onChanged }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [withLocation, setWithLocation] = useState(false);
  const [location, setLocation] = useState(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    setLoading(true);
    fetchComments(sightingId)
      .then(setItems)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, [sightingId]);

  async function onSubmit(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await createComment(sightingId, {
        text: body,
        lat: withLocation && location ? location.lat : undefined,
        lng: withLocation && location ? location.lng : undefined,
      });
      setText("");
      reload();
      onChanged?.();
      toast.success(t("comments.posted"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(commentId) {
    setBusy(true);
    try {
      await deleteComment(sightingId, commentId);
      reload();
      toast.success(t("comments.deleted"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onReport(commentId) {
    try {
      await reportComment(sightingId, commentId);
      toast.success(t("comments.reported"));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function useMyLocation() {
    try {
      const pos = await getPosition({ highAccuracy: false });
      setLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
      setWithLocation(true);
    } catch {
      toast.error(t("map.locateError"));
    }
  }

  return (
    <section className="comment-thread" aria-label={t("comments.title")}>
      <h3>{isMissing ? t("comments.tipsTitle") : t("comments.title")}</h3>

      {loading && <div className="skeleton skeleton-line" />}

      {!loading && items.length === 0 && (
        <p className="hint">{t("comments.empty")}</p>
      )}

      <ul className="comment-list">
        {items.map((c) => (
          <li key={c.id} className="comment-item">
            <p className="comment-text">{c.text}</p>
            <p className="comment-meta">
              {timeAgo(c.created_at)}
              {c.lat != null && c.lng != null && (
                <> · {t("comments.seenAt", { lat: c.lat.toFixed(4), lng: c.lng.toFixed(4) })}</>
              )}
            </p>
            <div className="comment-actions">
              {c.is_mine && canDeleteOwn && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(c.id)}>
                  {t("common.delete")}
                </button>
              )}
              {!c.is_mine && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReport(c.id)}>
                  {t("sighting.report")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form className="comment-form" onSubmit={onSubmit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isMissing ? t("comments.placeholderMissing") : t("comments.placeholder")}
          maxLength={500}
          rows={3}
        />
        {isMissing && (
          <div className="comment-location">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={withLocation}
                onChange={(e) => setWithLocation(e.target.checked)}
              />
              {t("comments.includeLocation")}
            </label>
            {withLocation && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={useMyLocation}>
                  {t("map.locate")}
                </button>
                <LocationPicker value={location} onChange={setLocation} compact />
              </>
            )}
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !text.trim()}>
          {busy ? t("comments.posting") : t("comments.post")}
        </button>
      </form>
    </section>
  );
}
