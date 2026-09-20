import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { assetUrl } from "../api";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";

/** Candidates for "is this the same cat?" — `similar` is null while loading. */
export default function SimilarSheet({ similar, linking, onClose, onPick }) {
  const { t } = useTranslation();
  return (
    <Modal
      onClose={onClose}
      labelledBy="similar-title"
      className="sheet report-sheet"
    >
      <div className="wizard-head">
        <h2 id="similar-title">{t("sighting.similarTitle")}</h2>
        <button
          className="icon-btn"
          aria-label={t("common.close")}
          onClick={() => onClose()}
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
              onClick={() => onPick(s.id)}
            >
              <img
                className="sighting-list-thumb"
                src={assetUrl(s.thumbnail_url)}
                alt=""
                loading="lazy"
              />
              <div className="sighting-list-body">
                <p className="sighting-list-desc">{s.description || t("common.catSighting")}</p>
                <p className="sighting-list-meta">
                  🐱 {timeAgo(s.created_at)} · {t("sighting.linkSameCat")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
