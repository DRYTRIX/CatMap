import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  NOTIFICATIONS_PAGE_SIZE,
  deleteNotification,
  fetchNotifications,
  markNotificationsRead,
} from "../api";
import { useToast } from "./Toast";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";

function parsePayload(json) {
  try {
    return JSON.parse(json || "{}");
  } catch {
    return {};
  }
}

export default function NotificationsModal({ onClose, onSelectSighting }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    fetchNotifications()
      .then((rows) => {
        if (!active) return;
        setItems(rows);
        setHasMore(rows.length >= NOTIFICATIONS_PAGE_SIZE);
      })
      .catch(() => active && setError(t("notifications.loadError")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [t]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const rows = await fetchNotifications(undefined, { offset: items.length });
      const seen = new Set(items.map((n) => n.id));
      setItems([...items, ...rows.filter((n) => !seen.has(n.id))]);
      setHasMore(rows.length >= NOTIFICATIONS_PAGE_SIZE);
    } catch {
      toast.error(t("notifications.loadError"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(item) {
    try {
      await deleteNotification(item.id);
      setItems((rows) => rows.filter((n) => n.id !== item.id));
    } catch {
      toast.error(t("notifications.deleteError"));
    }
  }

  function openItem(item) {
    if (!item.read_at) {
      markNotificationsRead([item.id]).catch(() => {});
      setItems((rows) =>
        rows.map((n) =>
          n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
    }
    if (item.sighting_id) onSelectSighting?.(item.sighting_id);
    else onClose();
  }

  function markAllRead() {
    const unread = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!unread.length) return;
    markNotificationsRead(unread).catch(() => {});
    setItems((rows) =>
      rows.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
  }

  return (
    <Modal onClose={onClose} labelledBy="notif-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="notif-title">{t("notifications.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      {items.some((n) => !n.read_at) && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={markAllRead}>
          {t("notifications.markAllRead")}
        </button>
      )}

      {loading && (
        <>
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </>
      )}

      {!loading && error && <p className="error">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="sighting-list-empty">{t("notifications.empty")}</div>
      )}

      <div className="sighting-list" role="list">
        {items.map((n) => {
          const payload = parsePayload(n.payload_json);
          return (
            <div key={n.id} className="notif-row" role="listitem">
              <button
                type="button"
                className={`sighting-list-item ${n.read_at ? "" : "is-unread"}`}
                onClick={() => openItem(n)}
              >
                <div className="sighting-list-body">
                  <p className="sighting-list-desc">{payload.title || n.type}</p>
                  <p className="sighting-list-meta">{payload.body || timeAgo(n.created_at)}</p>
                </div>
              </button>
              <button
                type="button"
                className="icon-btn notif-delete"
                aria-label={t("notifications.delete")}
                onClick={() => remove(n)}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          );
        })}
        {hasMore && (
          <button
            type="button"
            className="btn btn-ghost sighting-list-more"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {t("common.loadMore")}
          </button>
        )}
      </div>
    </Modal>
  );
}
