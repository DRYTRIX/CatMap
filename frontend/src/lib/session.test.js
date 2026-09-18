import { beforeEach, describe, expect, it } from "vitest";
import { clearSessionToken, getSessionToken, setSessionToken } from "./session";
import { authHeaders } from "../api";

describe("session + authHeaders", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores and clears the session token", () => {
    expect(getSessionToken()).toBeNull();
    setSessionToken("abc");
    expect(getSessionToken()).toBe("abc");
    clearSessionToken();
    expect(getSessionToken()).toBeNull();
  });

  it("authHeaders always include the device token and optionally Bearer", () => {
    const without = authHeaders();
    expect(without["X-Device-Token"]).toBeTruthy();
    expect(without.Authorization).toBeUndefined();

    setSessionToken("sess-1");
    const withSession = authHeaders();
    expect(withSession.Authorization).toBe("Bearer sess-1");
    expect(withSession["X-Device-Token"]).toBe(without["X-Device-Token"]);
  });
});
