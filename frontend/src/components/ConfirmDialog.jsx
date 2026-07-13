import Modal from "./Modal";

/**
 * Accessible confirmation dialog built on Modal.
 *
 * Props: open, title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <Modal onClose={onCancel} labelledBy="confirm-title" className="sheet confirm-sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <h2 id="confirm-title">{title}</h2>
      <p className="hint">{message}</p>
      <div className="row wizard-nav">
        <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn btn-block ${danger ? "btn-danger" : "btn-primary"}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
