import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";
import MissingPoster from "./MissingPoster";
import { useToast } from "./Toast";
import { track } from "../analytics";
import { sightingShareUrl } from "../lib/publicUrl";
import {
  loadPosterAssets,
  captureMapSnapshot,
  posterNodeToPdfBlob,
  downloadBlob,
  sharePdf,
  posterFilename,
} from "../lib/poster";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faDownload, faShareNodes } from "@fortawesome/free-solid-svg-icons";

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Missing-cat poster generator. Composes the sighting data (plus a few
 * render-only extras) into a printable A4 poster and exports it as a PDF that
 * can be downloaded or shared. Nothing typed here is persisted to the server.
 */
export default function PosterModal({ data, address, onClose }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const posterRef = useRef(null);
  const [reward, setReward] = useState("");
  const [phone, setPhone] = useState("");
  const [answersTo, setAnswersTo] = useState("");
  const [assets, setAssets] = useState({ photoDataUrl: null, qrDataUrl: null });
  const [mapDataUrl, setMapDataUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const shareUrl = sightingShareUrl(data.id);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const photoUrl = data.photos?.[0]?.photo_url ?? data.photo_url;
    loadPosterAssets({ photoUrl, shareUrl })
      .then((a) => active && setAssets(a))
      .finally(() => active && setLoading(false));
    if (data.lat != null && data.lng != null) {
      captureMapSnapshot(data.lat, data.lng)
        .then((url) => active && setMapDataUrl(url))
        .catch(() => {});
    }
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id]);

  const lastSeenLabel = useMemo(() => {
    const iso = data.last_seen_at || data.created_at;
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleDateString();
    }
  }, [data.last_seen_at, data.created_at, i18n.language]);

  const coords =
    data.lat != null && data.lng != null
      ? `${Number(data.lat).toFixed(5)}, ${Number(data.lng).toFixed(5)}`
      : "";

  const posterProps = {
    t,
    catName: data.cat_name,
    description: data.description,
    colorLabel: capitalize(data.color),
    lastSeenLabel,
    address,
    coords,
    contact: data.contact,
    photoDataUrl: assets.photoDataUrl,
    qrDataUrl: assets.qrDataUrl,
    mapDataUrl,
    reward: reward.trim(),
    phone: phone.trim(),
    answersTo: answersTo.trim(),
  };

  async function onDownload() {
    if (!posterRef.current) return;
    setBusy(true);
    try {
      const blob = await posterNodeToPdfBlob(posterRef.current);
      downloadBlob(blob, posterFilename(data.cat_name));
      track("poster_export", { method: "download" });
      toast.success(t("poster.downloaded"));
    } catch {
      toast.error(t("poster.error"));
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    if (!posterRef.current) return;
    setBusy(true);
    try {
      const blob = await posterNodeToPdfBlob(posterRef.current);
      const method = await sharePdf(blob, {
        filename: posterFilename(data.cat_name),
        title: t("poster.shareTitle", { name: data.cat_name || "" }),
      });
      track("poster_export", { method });
    } catch (e) {
      if (e?.name === "AbortError") return;
      toast.error(t("poster.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="poster-title" className="sheet poster-sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="poster-title">{t("poster.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <p className="hint">{t("poster.hint")}</p>

      <div className="field">
        <label htmlFor="poster-reward">{t("poster.reward")}</label>
        <input
          id="poster-reward"
          type="text"
          value={reward}
          onChange={(e) => setReward(e.target.value)}
          placeholder={t("poster.rewardPlaceholder")}
          maxLength={40}
        />
      </div>
      <div className="field">
        <label htmlFor="poster-phone">{t("poster.phone")}</label>
        <input
          id="poster-phone"
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("poster.phonePlaceholder")}
          maxLength={40}
        />
      </div>
      <div className="field">
        <label htmlFor="poster-answers">{t("poster.answersTo")}</label>
        <input
          id="poster-answers"
          type="text"
          value={answersTo}
          onChange={(e) => setAnswersTo(e.target.value)}
          placeholder={t("poster.answersToPlaceholder")}
          maxLength={40}
        />
      </div>

      <div className="poster-preview">
        <div className="poster-preview-scale">
          <MissingPoster ref={posterRef} {...posterProps} />
        </div>
      </div>

      <div className="sheet-actions">
        <button className="btn btn-primary" onClick={onDownload} disabled={busy || loading}>
          <FontAwesomeIcon icon={faDownload} /> {t("poster.download")}
        </button>
        <button className="btn btn-ghost" onClick={onShare} disabled={busy || loading}>
          <FontAwesomeIcon icon={faShareNodes} /> {t("poster.share")}
        </button>
      </div>
    </Modal>
  );
}
