import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import Modal from "./Modal";

const REPORT_REASON_IDS = ["not_a_cat", "spam", "wrong_location", "duplicate", "other"];

/** Pick a reason for reporting a sighting. */
export default function ReportSheet({ onClose, onSubmit }) {
  const { t } = useTranslation();
  return (
    <Modal
      onClose={onClose}
      labelledBy="report-title"
      className="sheet report-sheet"
    >
      <div className="wizard-head">
        <h2 id="report-title">{t("sighting.reportTitle")}</h2>
        <button
          className="icon-btn"
          aria-label={t("common.close")}
          onClick={() => onClose()}
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
            onClick={() => onSubmit(r)}
          >
            {t(`sighting.reasons.${r}`)}
          </button>
        ))}
      </div>
    </Modal>
  );
}
