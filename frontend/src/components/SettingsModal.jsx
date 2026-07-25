import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import {
  fetchVapidPublicKey,
  subscribePush,
  unsubscribePush,
} from "../api";
import { exportIdentity, importIdentity } from "../deviceToken";
import { getPosition } from "../lib/geolocate";
import { isNativePlatform } from "../lib/platform";
import { registerNativePush } from "../lib/pushNotifications";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function SettingsModal({ onClose }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [nearbyEnabled, setNearbyEnabled] = useState(false);
  const [radiusKm, setRadiusKm] = useState(5);
  const [alertLocation, setAlertLocation] = useState(null);
  const [exportJson, setExportJson] = useState("");
  const [importJson, setImportJson] = useState("");
  const [confirmImport, setConfirmImport] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const canvasRef = useRef(null);

  useEffect(() => {
    const data = exportIdentity();
    setExportJson(data);
    QRCode.toDataURL(data, { width: 200, margin: 1 })
      .then(setQrUrl)
      .catch(() => {});
    if (isNativePlatform()) {
      registerNativePush().catch(() => {});
    } else if ("serviceWorker" in navigator) {
      // Reflect the real subscription state so an already-subscribed user sees
      // "Disable" instead of re-subscribing.
      let active = true;
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => active && setPushEnabled(!!sub))
        .catch(() => {});
      return () => {
        active = false;
      };
    }
  }, []);

  // Radius clamped to the input's 1–100 range; falls back to 5 on empty/NaN.
  function clampRadius() {
    const n = Number(radiusKm);
    if (Number.isNaN(n)) return 5;
    return Math.min(100, Math.max(1, n));
  }

  async function enableWebPush() {
    if (pushBusy) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      toast.error(t("settings.pushUnsupported"));
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      toast.error(t("settings.pushDenied"));
      return;
    }
    setPushBusy(true);
    try {
      const { public_key: vapidKey } = await fetchVapidPublicKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await subscribePush({
        platform: "webpush",
        subscription: JSON.stringify(sub.toJSON()),
        alertLat: nearbyEnabled ? alertLocation?.lat : undefined,
        alertLng: nearbyEnabled ? alertLocation?.lng : undefined,
        alertRadiusKm: nearbyEnabled ? clampRadius() : undefined,
      });
      setPushEnabled(true);
      toast.success(t("settings.pushEnabled"));
    } catch (e) {
      toast.error(e.message || t("settings.pushFailed"));
    } finally {
      setPushBusy(false);
    }
  }

  async function disableWebPush() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(JSON.stringify(sub.toJSON()));
        await sub.unsubscribe();
      }
      setPushEnabled(false);
      toast.success(t("settings.pushDisabled"));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPushBusy(false);
    }
  }

  async function saveNearbyAlerts() {
    try {
      let lat = alertLocation?.lat;
      let lng = alertLocation?.lng;
      if (nearbyEnabled && (lat == null || lng == null)) {
        const pos = await getPosition({ highAccuracy: false });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        setAlertLocation({ lat, lng });
      }
      if (isNativePlatform()) {
        await registerNativePush({ alertLat: lat, alertLng: lng, alertRadiusKm: clampRadius() });
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await subscribePush({
            platform: "webpush",
            subscription: JSON.stringify(sub.toJSON()),
            alertLat: nearbyEnabled ? lat : undefined,
            alertLng: nearbyEnabled ? lng : undefined,
            alertRadiusKm: nearbyEnabled ? clampRadius() : undefined,
          });
        }
      }
      toast.success(t("settings.nearbySaved"));
    } catch (e) {
      toast.error(e.message);
    }
  }

  function copyExport() {
    navigator.clipboard.writeText(exportJson).then(
      () => toast.success(t("settings.copied")),
      () => toast.error(t("settings.copyFailed"))
    );
  }

  function doImport() {
    try {
      importIdentity(importJson.trim());
      toast.success(t("settings.importSuccess"));
      setConfirmImport(false);
      onClose();
      window.location.reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="settings-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="settings-title">{t("settings.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <section className="settings-section">
        <h3>{t("settings.notifications")}</h3>
        {!isNativePlatform() && (
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={pushEnabled ? disableWebPush : enableWebPush}
            disabled={pushBusy}
          >
            {pushEnabled ? t("settings.disablePush") : t("settings.enablePush")}
          </button>
        )}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={nearbyEnabled}
            onChange={(e) => setNearbyEnabled(e.target.checked)}
          />
          {t("settings.nearbyMissing")}
        </label>
        {nearbyEnabled && (
          <>
            <label htmlFor="radius-km">{t("settings.radiusKm")}</label>
            <input
              id="radius-km"
              type="number"
              min={1}
              max={100}
              value={radiusKm}
              onChange={(e) =>
                setRadiusKm(e.target.value === "" ? "" : Number(e.target.value))
              }
              onBlur={() => setRadiusKm(clampRadius())}
            />
            <button type="button" className="btn btn-ghost btn-block" onClick={saveNearbyAlerts}>
              {t("settings.saveNearby")}
            </button>
          </>
        )}
      </section>

      <section className="settings-section">
        <h3>{t("settings.myData")}</h3>
        <p className="hint">{t("settings.myDataHint")}</p>
        {qrUrl && <img src={qrUrl} alt={t("settings.qrAlt")} className="settings-qr" />}
        <textarea readOnly value={exportJson} rows={4} />
        <button type="button" className="btn btn-ghost btn-block" onClick={copyExport}>
          {t("settings.copyData")}
        </button>
        <label htmlFor="import-data">{t("settings.importLabel")}</label>
        <textarea
          id="import-data"
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          rows={4}
          placeholder={t("settings.importPlaceholder")}
        />
        <button
          type="button"
          className="btn btn-danger btn-block"
          disabled={!importJson.trim()}
          onClick={() => setConfirmImport(true)}
        >
          {t("settings.importButton")}
        </button>
      </section>

      <ConfirmDialog
        open={confirmImport}
        title={t("settings.importConfirmTitle")}
        message={t("settings.importConfirmMessage")}
        confirmLabel={t("settings.importButton")}
        danger
        onConfirm={doImport}
        onCancel={() => setConfirmImport(false)}
      />
    </Modal>
  );
}
