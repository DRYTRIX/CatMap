import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { submitIssueReport } from "../api";
import { track } from "../analytics";
import Modal from "./Modal";
import { useToast } from "./Toast";

const CATEGORY_IDS = ["bug", "wrong_data", "abuse", "other"];
const MAX_MESSAGE = 2000;

export default function ReportIssueModal({ onClose }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!category) {
      toast.error(t("reportIssue.categoryRequired"));
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error(t("reportIssue.messageRequired"));
      return;
    }

    setSubmitting(true);
    try {
      track("issue_report_submit", { category });
      await submitIssueReport(category, trimmed);
      toast.success(t("reportIssue.success"));
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="report-issue-title" className="sheet report-sheet">
      <form onSubmit={handleSubmit}>
        <div className="wizard-head">
          <h2 id="report-issue-title">{t("reportIssue.title")}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <p className="hint">{t("reportIssue.subtitle")}</p>

        <fieldset className="field report-issue-fieldset">
          <legend>{t("reportIssue.categoryLabel")}</legend>
          <div className="report-reasons">
            {CATEGORY_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`btn btn-ghost btn-block${category === id ? " is-selected" : ""}`}
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
              >
                {t(`reportIssue.categories.${id}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="report-issue-message">{t("reportIssue.messageLabel")}</label>
          <textarea
            id="report-issue-message"
            rows={5}
            maxLength={MAX_MESSAGE}
            placeholder={t("reportIssue.messagePlaceholder")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="row wizard-nav">
          <button type="button" className="btn btn-ghost btn-block" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? t("reportIssue.submitting") : t("reportIssue.submit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
