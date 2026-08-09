import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { flushQueue, listPending, removePending } from "../lib/offlineQueue";
import Modal from "./Modal";
import { useToast } from "./Toast";

/** Manage offline sighting uploads waiting to sync. */
export default function OfflineQueueModal({ onClose, onFlushed }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    listPending()
      .then(setItems)
      .catch(() => setItems([]));
  }

  useEffect(() => {
    reload();
  }, []);

  async function onRetry() {
    setBusy(true);
    try {
      await flushQueue({
        onItemDone: () => onFlushed?.(),
        onItemFailed: (err) => toast.error(err.message),
      });
      reload();
      toast.success(t("offline.retryDone"));
      onFlushed?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id) {
    setBusy(true);
    try {
      await removePending(id);
      reload();
      onFlushed?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="offline-queue-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="offline-queue-title">{t("offline.queueTitle")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <p className="hint">{t("offline.queueHint")}</p>

      {items === null && <div className="skeleton skeleton-line" />}

      {items?.length === 0 && (
        <div className="sighting-list-empty">{t("offline.queueEmpty")}</div>
      )}

      {items && items.length > 0 && (
        <>
          <ul className="comment-list">
            {items.map((item) => (
              <li key={item.id} className="comment-item">
                <p className="comment-text">
                  {item.description || t("common.catSighting")}
                </p>
                <p className="comment-meta">
                  {item.kind === "missing" ? t("sighting.missingBadge") : t("common.catSighting")}
                  {item.queuedAt ? ` · ${new Date(item.queuedAt).toLocaleString()}` : ""}
                </p>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onRemove(item.id)}
                  disabled={busy}
                >
                  {t("common.remove")}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={onRetry}
            disabled={busy || !navigator.onLine}
          >
            {t("offline.retryAll")}
          </button>
        </>
      )}
    </Modal>
  );
}
