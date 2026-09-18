import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  authChangePassword,
  authDeleteAccount,
  authForgotPassword,
  authResendVerification,
  authResetPassword,
  authSetPassword,
  authUpdateEmailPrefs,
  authVerifyEmail,
} from "../api";
import { useAuth } from "../context/AuthContext";
import { isNativePlatform } from "../lib/platform";
import { signInWithGoogleNative, signInWithGoogleWeb } from "../lib/googleSignIn";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faEye,
  faEyeSlash,
  faSpinner,
  faTriangleExclamation,
  faUserCircle,
} from "@fortawesome/free-solid-svg-icons";

/** Password input with a show/hide toggle, styled like the rest of the app's .field inputs. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  required,
  show,
  onToggleShow,
  showLabel,
  hideLabel,
  hint,
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field-wrap">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          minLength={minLength}
          required={required}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={onToggleShow}
          aria-label={show ? hideLabel : showLabel}
        >
          <FontAwesomeIcon icon={show ? faEyeSlash : faEye} />
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

/**
 * Account modal: sign in / sign up / Google, email prefs, password, export, delete.
 *
 * Props:
 * - onClose
 * - initialMode: "signin" | "signup" | "reset" | "verify" | "account"
 * - verifyToken / resetToken from deep links
 */
export default function AccountModal({
  onClose,
  initialMode = "signin",
  verifyToken = null,
  resetToken = null,
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    user,
    signedIn,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    refresh,
    exportData,
  } = useAuth();

  const [mode, setMode] = useState(
    verifyToken ? "verify" : resetToken ? "reset" : signedIn ? "account" : initialMode
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteContent, setDeleteContent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (signedIn && (mode === "signin" || mode === "signup")) setMode("account");
  }, [signedIn, mode]);

  useEffect(() => {
    if (verifyToken) {
      setBusy(true);
      authVerifyEmail(verifyToken)
        .then(async () => {
          toast.success(t("account.emailVerified"));
          await refresh();
          setMode("account");
        })
        .catch((e) => {
          toast.error(e.message);
          // Don't strand the user on a blank "verifying" screen forever.
          setMode("signin");
        })
        .finally(() => setBusy(false));
    }
  }, [verifyToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!googleBtnRef.current || signedIn || mode === "reset" || mode === "verify") return;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || isNativePlatform()) return;
    let cancelled = false;
    signInWithGoogleWeb(googleBtnRef.current, clientId, async (idToken) => {
      if (cancelled) return;
      setBusy(true);
      try {
        await signInWithGoogle(idToken);
        toast.success(t("account.signedIn"));
        setMode("account");
      } catch (e) {
        toast.error(e.message);
      } finally {
        setBusy(false);
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode, signedIn, signInWithGoogle, t, toast]);

  async function handleEmailAuth(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp({ email, password, name });
        toast.success(t("account.signedUp"));
      } else {
        await signIn({ email, password });
        toast.success(t("account.signedIn"));
      }
      setMode("account");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleNativeGoogle() {
    setBusy(true);
    try {
      const idToken = await signInWithGoogleNative();
      await signInWithGoogle(idToken);
      toast.success(t("account.signedIn"));
      setMode("account");
    } catch (err) {
      toast.error(err.message || t("account.googleFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot() {
    if (!email.trim()) {
      toast.error(t("account.emailRequired"));
      return;
    }
    setBusy(true);
    try {
      await authForgotPassword(email.trim());
      toast.success(t("account.resetSent"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await authResetPassword({ token: resetToken, password });
      toast.success(t("account.passwordChanged"));
      setMode("signin");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (user?.has_password) {
        await authChangePassword({
          currentPassword,
          newPassword,
        });
      } else {
        await authSetPassword(newPassword);
      }
      toast.success(t("account.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePref(key, value) {
    try {
      await authUpdateEmailPrefs({ [key]: value });
      await refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleExport() {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "catmap-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("account.exported"));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await authDeleteAccount({ deleteContent });
      await signOut();
      toast.success(t("account.deleted"));
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const prefs = user?.email_prefs || {};

  return (
    <Modal onClose={onClose} labelledBy="account-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="account-title">{t("account.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      {mode === "verify" && (
        <div className="account-status">
          <FontAwesomeIcon icon={faSpinner} spin size="2x" />
          <p>{t("account.verifying")}</p>
        </div>
      )}

      {mode === "reset" && (
        <form className="account-form-fields" onSubmit={handleReset}>
          <p className="hint">{t("account.resetHint")}</p>
          <PasswordField
            id="reset-password"
            label={t("account.newPassword")}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            show={showPassword}
            onToggleShow={() => setShowPassword((v) => !v)}
            showLabel={t("account.showPassword")}
            hideLabel={t("account.hidePassword")}
            hint={t("account.passwordHint")}
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy && <FontAwesomeIcon icon={faSpinner} spin className="btn-spinner" />}
            {t("account.setPassword")}
          </button>
        </form>
      )}

      {(mode === "signin" || mode === "signup") && (
        <div className="account-form-fields">
          <div className="segmented" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={`segmented-opt${mode === "signin" ? " is-active" : ""}`}
              onClick={() => setMode("signin")}
            >
              {t("account.signIn")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={`segmented-opt${mode === "signup" ? " is-active" : ""}`}
              onClick={() => setMode("signup")}
            >
              {t("account.signUp")}
            </button>
          </div>

          <form onSubmit={handleEmailAuth}>
            {mode === "signup" && (
              <div className="field">
                <label htmlFor="account-name">{t("account.nameOptional")}</label>
                <input
                  id="account-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="account-email">{t("account.email")}</label>
              <input
                id="account-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <PasswordField
              id="account-password"
              label={t("account.password")}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              show={showPassword}
              onToggleShow={() => setShowPassword((v) => !v)}
              showLabel={t("account.showPassword")}
              hideLabel={t("account.hidePassword")}
              hint={mode === "signup" ? t("account.passwordHint") : null}
            />
            {mode === "signin" && (
              <button
                type="button"
                className="link-btn"
                onClick={handleForgot}
                disabled={busy}
              >
                {t("account.forgotPassword")}
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={busy}
              style={{ marginTop: 14 }}
            >
              {busy && <FontAwesomeIcon icon={faSpinner} spin className="btn-spinner" />}
              {mode === "signup" ? t("account.createAccount") : t("account.signIn")}
            </button>
          </form>

          <div className="or-divider">{t("account.or")}</div>

          {isNativePlatform() ? (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={handleNativeGoogle}
              disabled={busy}
            >
              {t("account.continueGoogle")}
            </button>
          ) : (
            <div ref={googleBtnRef} className="google-btn-slot" />
          )}

          <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
            {t("account.optionalHint")}
          </p>
        </div>
      )}

      {mode === "account" && user && (
        <div className="account-form-fields">
          <section className="settings-section">
            <div className="account-identity">
              <span className="account-identity-icon" aria-hidden="true">
                <FontAwesomeIcon icon={faUserCircle} />
              </span>
              <span className="account-identity-email">{user.email}</span>
            </div>
            {user.providers?.length > 0 && (
              <p className="hint">
                {t("account.linked")}: {user.providers.join(", ")}
              </p>
            )}
            {!user.email_verified && (
              <div className="notice-warning">
                <FontAwesomeIcon icon={faTriangleExclamation} />
                <span>{t("account.unverified")}</span>
                <button
                  type="button"
                  className="link-btn notice-warning-action"
                  onClick={async () => {
                    try {
                      await authResendVerification();
                      toast.success(t("account.verifySent"));
                    } catch (e) {
                      toast.error(e.message);
                    }
                  }}
                >
                  {t("account.resendVerify")}
                </button>
              </div>
            )}
          </section>

          <section className="settings-section">
            <h3>{t("account.emailPrefs")}</h3>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(prefs.enabled)}
                onChange={(e) => togglePref("enabled", e.target.checked)}
              />
              {t("account.prefEnabled")}
            </label>
            <label
              className={`checkbox-row checkbox-row--sub${!prefs.enabled ? " checkbox-row--disabled" : ""}`}
            >
              <input
                type="checkbox"
                checked={Boolean(prefs.activity)}
                disabled={!prefs.enabled}
                onChange={(e) => togglePref("activity", e.target.checked)}
              />
              {t("account.prefActivity")}
            </label>
            <label
              className={`checkbox-row checkbox-row--sub${!prefs.enabled ? " checkbox-row--disabled" : ""}`}
            >
              <input
                type="checkbox"
                checked={Boolean(prefs.following)}
                disabled={!prefs.enabled}
                onChange={(e) => togglePref("following", e.target.checked)}
              />
              {t("account.prefFollowing")}
            </label>
            <label
              className={`checkbox-row checkbox-row--sub${!prefs.enabled ? " checkbox-row--disabled" : ""}`}
            >
              <input
                type="checkbox"
                checked={Boolean(prefs.nearby)}
                disabled={!prefs.enabled}
                onChange={(e) => togglePref("nearby", e.target.checked)}
              />
              {t("account.prefNearby")}
            </label>
            <label
              className={`checkbox-row checkbox-row--sub${!prefs.enabled ? " checkbox-row--disabled" : ""}`}
            >
              <input
                type="checkbox"
                checked={Boolean(prefs.moderation)}
                disabled={!prefs.enabled}
                onChange={(e) => togglePref("moderation", e.target.checked)}
              />
              {t("account.prefModeration")}
            </label>
          </section>

          <section className="settings-section">
            <h3>{t("account.passwordSection")}</h3>
            <form onSubmit={handleChangePassword}>
              {user.has_password && (
                <PasswordField
                  id="account-current-password"
                  label={t("account.currentPassword")}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  show={showCurrentPassword}
                  onToggleShow={() => setShowCurrentPassword((v) => !v)}
                  showLabel={t("account.showPassword")}
                  hideLabel={t("account.hidePassword")}
                />
              )}
              <PasswordField
                id="account-new-password"
                label={t("account.newPassword")}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                show={showNewPassword}
                onToggleShow={() => setShowNewPassword((v) => !v)}
                showLabel={t("account.showPassword")}
                hideLabel={t("account.hidePassword")}
              />
              <button type="submit" className="btn btn-ghost btn-block" disabled={busy}>
                {busy && <FontAwesomeIcon icon={faSpinner} spin className="btn-spinner" />}
                {user.has_password ? t("account.changePassword") : t("account.setPassword")}
              </button>
            </form>
          </section>

          <section className="settings-section">
            <h3>{t("account.data")}</h3>
            <button type="button" className="btn btn-ghost btn-block" onClick={handleExport}>
              {t("account.export")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => signOut().then(onClose)}
            >
              {t("account.signOut")}
            </button>
          </section>

          <section className="settings-section settings-subsection">
            <h3>{t("account.dangerZone")}</h3>
            <p className="hint">{t("account.deleteHint")}</p>
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={() => {
                setDeleteContent(false);
                setConfirmDelete(true);
              }}
            >
              {t("account.delete")}
            </button>
          </section>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          open
          danger
          title={t("account.deleteTitle")}
          message={
            deleteContent
              ? t("account.deleteBodyWithContent")
              : t("account.deleteBody")
          }
          confirmLabel={t("account.delete")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        >
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={deleteContent}
              onChange={(e) => setDeleteContent(e.target.checked)}
            />
            {t("account.deleteContentToo")}
          </label>
        </ConfirmDialog>
      )}
    </Modal>
  );
}
