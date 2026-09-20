import { API_BASE, authHeaders, formBody, handle } from "./core";

// ---- Auth ----

export async function authSignup({ email, password, name }) {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: "POST",
    headers: authHeaders(),
    body: formBody({ email, password, name: name || "" }),
  });
  return handle(res);
}

export async function authLogin({ email, password }) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: authHeaders(),
    body: formBody({ email, password }),
  });
  return handle(res);
}

export async function authGoogle({ idToken }) {
  const res = await fetch(`${API_BASE}/api/auth/google`, {
    method: "POST",
    headers: authHeaders(),
    body: formBody({ id_token: idToken }),
  });
  return handle(res);
}

export async function authLogout() {
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle(res);
}

export async function authMe() {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: authHeaders(),
  });
  return handle(res);
}

export async function authVerifyEmail(token) {
  const res = await fetch(`${API_BASE}/api/auth/verify-email`, {
    method: "POST",
    headers: authHeaders(),
    body: formBody({ token }),
  });
  return handle(res);
}

export async function authResendVerification() {
  const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle(res);
}

export async function authForgotPassword(email) {
  const res = await fetch(`${API_BASE}/api/auth/password/forgot`, {
    method: "POST",
    headers: authHeaders(),
    body: formBody({ email }),
  });
  if (res.status === 204) return null;
  return handle(res);
}

export async function authResetPassword({ token, password }) {
  const res = await fetch(`${API_BASE}/api/auth/password/reset`, {
    method: "POST",
    headers: authHeaders(),
    body: formBody({ token, password }),
  });
  return handle(res);
}

export async function authChangePassword({ currentPassword, newPassword }) {
  const res = await fetch(`${API_BASE}/api/auth/password/change`, {
    method: "POST",
    headers: authHeaders(),
    body: formBody({
      current_password: currentPassword || "",
      new_password: newPassword,
    }),
  });
  return handle(res);
}

export async function authSetPassword(password) {
  const res = await fetch(`${API_BASE}/api/auth/email/set-password`, {
    method: "POST",
    headers: authHeaders(),
    body: formBody({ password }),
  });
  return handle(res);
}

export async function authUpdateEmailPrefs(prefs) {
  const res = await fetch(`${API_BASE}/api/auth/email-prefs`, {
    method: "PATCH",
    headers: authHeaders(),
    body: formBody(prefs),
  });
  return handle(res);
}

export async function authExport() {
  const res = await fetch(`${API_BASE}/api/auth/export`, {
    headers: authHeaders(),
  });
  return handle(res);
}

export async function authDeleteAccount({ deleteContent = false } = {}) {
  const res = await fetch(`${API_BASE}/api/auth/account`, {
    method: "DELETE",
    headers: authHeaders(),
    body: formBody({ delete_content: deleteContent ? "true" : "false" }),
  });
  return handle(res);
}
