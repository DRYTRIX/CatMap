import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchNotifications, markNotificationsRead } from "../api";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

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

  useEffect(() => {
    let active = true;
    fetchNotifications()
      .then((rows) => active && setItems(rows))
      .finally(() => active && setLoading(false));
    markNotificationsRead().catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function openItem(item) {
    if (item.sighting_id) onSelectSighting?.(item.sighting_id);
    onClose();
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

      {loading && (
        <>
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </>
      )}

      {!loading && items.length === 0 && (
        <p className="hint">{t("notifications.empty")}</p>
      )}

      <div className="sighting-list" role="list">
        {items.map((n) => {
          const payload = parsePayload(n.payload_json);
          return (
            <button
              key={n.id}
              type="button"
              className={`sighting-list-item ${n.read_at ? "" : "is-unread"}`}
              role="listitem"
              onClick={() => openItem(n)}
            >
              <div className="sighting-list-body">
                <p className="sighting-list-desc">{payload.title || n.type}</p>
                <p className="sighting-list-meta">{payload.body || timeAgo(n.created_at)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
