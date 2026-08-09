import { beforeEach, describe, expect, it } from "vitest";
import {
  exportIdentity,
  getConfirmedSet,
  getCreatedSet,
  getDeviceToken,
  importIdentity,
  isMine,
  markConfirmed,
  markCreated,
} from "./deviceToken";

describe("deviceToken", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates a token once and persists it across calls", () => {
    const first = getDeviceToken();
    expect(first).toBeTruthy();
    expect(getDeviceToken()).toBe(first);
    expect(localStorage.getItem("catmap_device_token")).toBe(first);
  });

  it("tracks confirmed sightings", () => {
    expect(getConfirmedSet().has("s1")).toBe(false);
    markConfirmed("s1");
    expect(getConfirmedSet().has("s1")).toBe(true);
  });

  it("tracks created sightings and exposes isMine", () => {
    expect(isMine("s1")).toBe(false);
    markCreated("s1");
    expect(isMine("s1")).toBe(true);
    expect(getCreatedSet().has("s1")).toBe(true);
  });

  it("falls back to defaults on corrupt storage", () => {
    localStorage.setItem("catmap_confirmed", "{not json");
    localStorage.setItem("catmap_created", "{not json");
    expect(getConfirmedSet().size).toBe(0);
    expect(getCreatedSet().size).toBe(0);
  });

  it("exports and imports identity including created and confirmed", () => {
    markCreated("c1");
    markConfirmed("k1");
    localStorage.setItem("catmap_favorites", JSON.stringify(["f1"]));
    const json = exportIdentity();
    localStorage.clear();
    importIdentity(json);
    expect(getDeviceToken()).toBeTruthy();
    expect(getCreatedSet().has("c1")).toBe(true);
    expect(getConfirmedSet().has("k1")).toBe(true);
    expect(JSON.parse(localStorage.getItem("catmap_favorites"))).toContain("f1");
  });
});
