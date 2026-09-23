import { describe, expect, it } from "vitest";
import { isValidGps, parseNativeExifGps } from "./photoGps";

describe("isValidGps", () => {
  it("rejects missing/invalid/zeroed/out-of-range coordinates", () => {
    expect(isValidGps(null)).toBe(false);
    expect(isValidGps({ latitude: NaN, longitude: 4 })).toBe(false);
    expect(isValidGps({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isValidGps({ latitude: 91, longitude: 4 })).toBe(false);
    expect(isValidGps({ latitude: 45, longitude: 181 })).toBe(false);
  });

  it("accepts a real coordinate", () => {
    expect(isValidGps({ latitude: 50.85, longitude: 4.35 })).toBe(true);
  });
});

describe("parseNativeExifGps", () => {
  it("returns null for missing/empty exif", () => {
    expect(parseNativeExifGps(null)).toBeNull();
    expect(parseNativeExifGps(undefined)).toBeNull();
    expect(parseNativeExifGps({})).toBeNull();
  });

  it("returns null instead of throwing on garbage input", () => {
    expect(parseNativeExifGps("not json {")).toBeNull();
    expect(parseNativeExifGps(42)).toBeNull();
    expect(parseNativeExifGps({ GPS: {} })).toBeNull();
  });

  it("parses the iOS GPS dict shape (decimal degrees, sign from Ref)", () => {
    const exif = {
      GPS: { Latitude: 50.85, LatitudeRef: "N", Longitude: 4.35, LongitudeRef: "E" },
    };
    expect(parseNativeExifGps(exif)).toEqual({ latitude: 50.85, longitude: 4.35 });
  });

  it("applies southern/western signs on iOS", () => {
    const exif = {
      GPS: { Latitude: 33.9, LatitudeRef: "S", Longitude: 18.4, LongitudeRef: "W" },
    };
    expect(parseNativeExifGps(exif)).toEqual({ latitude: -33.9, longitude: -18.4 });
  });

  it("parses the Android flat DMS-rational shape", () => {
    // 50°51'0" N, 4°21'0" E
    const exif = {
      GPSLatitude: "50/1,51/1,0/1",
      GPSLatitudeRef: "N",
      GPSLongitude: "4/1,21/1,0/1",
      GPSLongitudeRef: "E",
    };
    const result = parseNativeExifGps(exif);
    expect(result.latitude).toBeCloseTo(50.85, 5);
    expect(result.longitude).toBeCloseTo(4.35, 5);
  });

  it("applies southern/western signs on Android", () => {
    const exif = {
      GPSLatitude: "33/1,54/1,0/1",
      GPSLatitudeRef: "S",
      GPSLongitude: "18/1,24/1,0/1",
      GPSLongitudeRef: "W",
    };
    const result = parseNativeExifGps(exif);
    expect(result.latitude).toBeCloseTo(-33.9, 5);
    expect(result.longitude).toBeCloseTo(-18.4, 5);
  });

  it("accepts exif shipped as a JSON string", () => {
    const exif = JSON.stringify({
      GPS: { Latitude: 50.85, LatitudeRef: "N", Longitude: 4.35, LongitudeRef: "E" },
    });
    expect(parseNativeExifGps(exif)).toEqual({ latitude: 50.85, longitude: 4.35 });
  });

  it("rejects a zeroed-out coordinate", () => {
    const exif = { GPS: { Latitude: 0, LatitudeRef: "N", Longitude: 0, LongitudeRef: "E" } };
    expect(parseNativeExifGps(exif)).toBeNull();
  });

  it("returns null for a malformed Android DMS string", () => {
    const exif = {
      GPSLatitude: "not-a-fraction",
      GPSLatitudeRef: "N",
      GPSLongitude: "4/1,21/1,0/1",
      GPSLongitudeRef: "E",
    };
    expect(parseNativeExifGps(exif)).toBeNull();
  });
});
