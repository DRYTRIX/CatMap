import { useTranslation } from "react-i18next";
import Modal from "./Modal";

/**
 * Accessible confirmation dialog built on Modal.
 *
 * Props: open, title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel
 * Labels default to the localized common strings when not provided.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <Modal onClose={onCancel} labelledBy="confirm-title" className="sheet confirm-sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <h2 id="confirm-title">{title}</h2>
      <p className="hint">{message}</p>
      <div className="row wizard-nav">
        <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>
          {cancelLabel ?? t("common.cancel")}
        </button>
        <button
          type="button"
          className={`btn btn-block ${danger ? "btn-danger" : "btn-primary"}`}
          onClick={onConfirm}
        >
          {confirmLabel ?? t("common.confirm")}
        </button>
      </div>
    </Modal>
  );
}
