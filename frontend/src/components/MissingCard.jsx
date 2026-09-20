import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPhone } from "@fortawesome/free-solid-svg-icons";
import { sendPrivateTip } from "../api";
import { useToast } from "./Toast";

// Turn a free-text contact into a tappable tel:/mailto: link when it clearly
// looks like a phone number or email; otherwise return null (render as text).
export function contactHref(contact) {
  const s = (contact || "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  const phone = s.replace(/[^\d+]/g, "");
  if (/^\+?\d{6,}$/.test(phone)) return `tel:${phone}`;
  return null;
}

/** Missing-cat details: contact, and a private-tip form for non-owners. */
export default function MissingCard({ data, sightingId, mine, isFound }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [tip, setTip] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  const [sending, setSending] = useState(false);

  async function onSendPrivateTip(e) {
    e.preventDefault();
    const body = tip.trim();
    if (!body) return;
    setSending(true);
    try {
      await sendPrivateTip(sightingId, body);
      setTip("");
      setTipOpen(false);
      toast.success(t("sighting.privateTipSent"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`missing-card ${isFound ? "is-found" : ""}`}>
      <div className="missing-card-head">
        <span
          className={`kind-badge ${isFound ? "kind-badge--found" : "kind-badge--missing"}`}
        >
          {isFound ? t("sighting.foundBadge") : t("sighting.missingBadge")}
        </span>
        {data.cat_name && <span className="missing-card-name">{data.cat_name}</span>}
      </div>
      {!isFound && <p className="missing-card-sub">{t("sighting.missingHelp")}</p>}
      {data.contact &&
        (contactHref(data.contact) ? (
          <a
            className="btn btn-primary btn-block missing-contact"
            href={contactHref(data.contact)}
          >
            <FontAwesomeIcon icon={faPhone} /> {data.contact}
          </a>
        ) : (
          <p className="missing-info-row">
            <strong>{t("sighting.contactLabel")}:</strong> {data.contact}
          </p>
        ))}
      {!mine && !isFound && !data.contact && (
        <p className="hint">{t("sighting.contactPrivateHint")}</p>
      )}
      {!mine && !isFound && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => setTipOpen((v) => !v)}
        >
          {t("sighting.privateTip")}
        </button>
      )}
      {tipOpen && (
        <form className="private-tip-form" onSubmit={onSendPrivateTip}>
          <textarea
            value={tip}
            onChange={(e) => setTip(e.target.value)}
            placeholder={t("sighting.privateTipPlaceholder")}
            maxLength={500}
            rows={3}
          />
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={sending || !tip.trim()}
          >
            {t("sighting.privateTipSend")}
          </button>
        </form>
      )}
    </div>
  );
}
