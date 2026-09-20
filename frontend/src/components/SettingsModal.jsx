import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import {
  fetchPushAlertPrefs,
  fetchVapidPublicKey,
  subscribePush,
  unsubscribePush,
} from "../api";
import {
  exportIdentity,
  getDeviceToken,
  importIdentity,
  markBackedUp,
} from "../deviceToken";
import { getPosition } from "../lib/geolocate";
import { isNativePlatform } from "../lib/platform";
import { registerNativePush } from "../lib/pushNotifications";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { useAuth } from "../context/AuthContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faUserCircle,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function SettingsModal({ onClose, onReportIssue, onOpenAccount, onOpenStats }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { signedIn, user } = useAuth();
  const accountLabel = signedIn ? t("settings.manageAccountShort") : t("settings.signIn");
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

    let active = true;
    fetchPushAlertPrefs()
      .then((prefs) => {
        if (!active) return;
        if (prefs.has_subscription) setPushEnabled(true);
        if (prefs.alert_lat != null && prefs.alert_lng != null) {
          setNearbyEnabled(true);
          setAlertLocation({ lat: prefs.alert_lat, lng: prefs.alert_lng });
          if (prefs.alert_radius_km) setRadiusKm(prefs.alert_radius_km);
        }
      })
      .catch(() => {});

    if (isNativePlatform()) {
      registerNativePush().catch(() => {});
    } else if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (active && sub) setPushEnabled(true);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, []);

  function clampRadius() {
    const n = Number(radiusKm);
    if (Number.isNaN(n)) return 5;
    return Math.min(100, Math.max(1, n));
  }

  async function ensureWebPushSubscription({ alertLat, alertLng, alertRadiusKm }) {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      throw new Error(t("settings.pushUnsupported"));
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      throw new Error(t("settings.pushDenied"));
    }
    const { public_key: vapidKey } = await fetchVapidPublicKey();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    await subscribePush({
      platform: "webpush",
      subscription: JSON.stringify(sub.toJSON()),
      alertLat,
      alertLng,
      alertRadiusKm,
    });
    setPushEnabled(true);
    return sub;
  }

  async function enableWebPush() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      await ensureWebPushSubscription({
        alertLat: nearbyEnabled ? alertLocation?.lat : undefined,
        alertLng: nearbyEnabled ? alertLocation?.lng : undefined,
        alertRadiusKm: nearbyEnabled ? clampRadius() : undefined,
      });
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
      setNearbyEnabled(false);
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
      const radius = clampRadius();
      if (isNativePlatform()) {
        await registerNativePush({
          alertLat: nearbyEnabled ? lat : undefined,
          alertLng: nearbyEnabled ? lng : undefined,
          alertRadiusKm: nearbyEnabled ? radius : undefined,
        });
      } else if (nearbyEnabled) {
        await ensureWebPushSubscription({
          alertLat: lat,
          alertLng: lng,
          alertRadiusKm: radius,
        });
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await subscribePush({
            platform: "webpush",
            subscription: JSON.stringify(sub.toJSON()),
            alertLat: undefined,
            alertLng: undefined,
            alertRadiusKm: undefined,
          });
        } else {
          toast.error(t("settings.nearbyNeedsPush"));
          return;
        }
      }
      toast.success(t("settings.nearbySaved"));
    } catch (e) {
      toast.error(e.message || t("settings.pushFailed"));
    }
  }

  function copyExport() {
    navigator.clipboard.writeText(exportJson).then(
      () => {
        markBackedUp();
        toast.success(t("settings.copied"));
      },
      () => toast.error(t("settings.copyFailed"))
    );
  }

  function copyBackupCode() {
    navigator.clipboard.writeText(getDeviceToken()).then(
      () => {
        markBackedUp();
        toast.success(t("settings.copied"));
      },
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
        <h3>{t("settings.account")}</h3>
        {signedIn ? (
          <>
            <div className="account-identity">
              <span className="account-identity-icon" aria-hidden="true">
                <FontAwesomeIcon icon={faUserCircle} />
              </span>
              <span className="account-identity-email">{user?.email}</span>
            </div>
            <p className="hint">{t("settings.accountSignedInHint")}</p>
          </>
        ) : (
          <p className="hint">{t("settings.accountHint")}</p>
        )}
        <button
          type="button"
          className={`btn btn-block ${signedIn ? "btn-ghost" : "btn-primary"}`}
          onClick={() => onOpenAccount?.()}
        >
          {accountLabel}
        </button>
      </section>

      <section className="settings-section">
        <h3>{t("settings.notifications")}</h3>
        {!isNativePlatform() && (
          <button
            type="button"
            className={`btn btn-block ${pushEnabled ? "btn-ghost" : "btn-primary"}`}
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
            <p className="hint">{t("settings.nearbyHint")}</p>
            <div className="field">
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
            </div>
            <button type="button" className="btn btn-ghost btn-block" onClick={saveNearbyAlerts}>
              {t("settings.saveNearby")}
            </button>
          </>
        )}
        {!nearbyEnabled && pushEnabled && (
          <button type="button" className="btn btn-ghost btn-block" onClick={saveNearbyAlerts}>
            {t("settings.clearNearby")}
          </button>
        )}
      </section>

      <section className="settings-section">
        <h3>{t("stats.title")}</h3>
        <p className="hint">{t("stats.hint")}</p>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => onOpenStats?.()}>
          {t("stats.open")}
        </button>
      </section>

      <section className="settings-section">
        <h3>{t("settings.help")}</h3>
        <p className="hint">{t("settings.helpHint")}</p>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => onReportIssue?.()}
        >
          {t("settings.reportIssue")}
        </button>
      </section>

      <section className="settings-section" id="settings-my-data">
        <h3>{t("settings.myData")}</h3>
        {signedIn ? (
          <p className="hint">{t("settings.myDataSignedInHint")}</p>
        ) : (
          <p className="hint">{t("settings.myDataHint")}</p>
        )}
        {!signedIn && (
          <div className="notice-warning" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <span>{t("settings.qrWarning")}</span>
          </div>
        )}
        {qrUrl && !signedIn && (
          <img src={qrUrl} alt={t("settings.qrAlt")} className="settings-qr" />
        )}
        <textarea
          readOnly
          value={exportJson}
          rows={4}
          aria-label={t("settings.copyData")}
        />
        <button type="button" className="btn btn-ghost btn-block" onClick={copyBackupCode}>
          {t("settings.copyBackupCode")}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={copyExport}>
          {t("settings.copyData")}
        </button>

        <div className="settings-subsection">
          <div className="field">
            <label htmlFor="import-data">{t("settings.importLabel")}</label>
            <textarea
              id="import-data"
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={3}
              placeholder={t("settings.importPlaceholder")}
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => setConfirmImport(true)}
            disabled={!importJson.trim()}
          >
            {t("settings.importData")}
          </button>
        </div>
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
