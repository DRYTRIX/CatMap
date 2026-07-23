import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assetUrl,
  confirmSighting,
  fetchSighting,
  fetchStats,
  reverseGeocode,
} from "./api";

describe("api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("assetUrl returns backend-relative paths unchanged when no API base is set", () => {
    expect(assetUrl("/api/sightings/1/photo")).toBe("/api/sightings/1/photo");
  });

  it("fetchStats resolves with the parsed JSON body", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ total: 5 }) });

    await expect(fetchStats()).resolves.toEqual({ total: 5 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/stats"));
  });

  it("fetchSighting rejects with the server's error detail", async () => {
    fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: "Not found" }) });

    await expect(fetchSighting("missing")).rejects.toThrow("Not found");
  });

  it("fetchSighting falls back to a generic message when there's no detail", async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(fetchSighting("oops")).rejects.toThrow("Request failed (500)");
  });

  it("confirmSighting sends the device token header", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ confirmations_count: 1 }) });

    await confirmSighting("abc");

    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("/api/sightings/abc/confirm");
    expect(init.headers["X-Device-Token"]).toBeTruthy();
  });

  it("reverseGeocode queries Nominatim and returns display_name", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ display_name: "Antwerp, Belgium" }) });

    await expect(reverseGeocode(51.2, 4.4)).resolves.toBe("Antwerp, Belgium");
    const [url] = fetch.mock.calls[0];
    expect(url).toContain("nominatim.openstreetmap.org/reverse");
    expect(url).toContain("lat=51.2");
    expect(url).toContain("lon=4.4");
  });

  it("reverseGeocode returns null on failure instead of throwing", async () => {
    fetch.mockRejectedValue(new Error("network"));
    await expect(reverseGeocode(0, 0)).resolves.toBeNull();

    fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(reverseGeocode(0, 0)).resolves.toBeNull();
  });
});
