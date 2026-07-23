import { describe, expect, it, vi } from "vitest";

vi.mock("html-to-image", () => ({
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,AAAA"),
}));

// jsPDF's PNG decoder isn't jsdom-friendly; mock it so the test covers our
// orchestration (rasterise → addImage → output) rather than jsPDF internals.
vi.mock("jspdf", () => ({
  default: class {
    addImage() {}
    output() {
      return new Blob(["%PDF-1.3"], { type: "application/pdf" });
    }
  },
}));

import {
  buildQrDataUrl,
  blobToDataUrl,
  posterFilename,
  posterNodeToPdfBlob,
  lngToTileX,
  latToTileY,
} from "./poster";

describe("poster helpers", () => {
  it("posterFilename slugifies the cat name", () => {
    expect(posterFilename("Mr. Whiskers!")).toBe("missing-mr-whiskers.pdf");
    expect(posterFilename("")).toBe("missing-cat.pdf");
    expect(posterFilename(undefined)).toBe("missing-cat.pdf");
  });

  it("buildQrDataUrl produces a PNG data URL", async () => {
    const url = await buildQrDataUrl("https://example.com/s/abc");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("blobToDataUrl reads a blob into a data URL", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const url = await blobToDataUrl(blob);
    expect(url.startsWith("data:text/plain;base64,")).toBe(true);
  });

  it("maps lng/lat to slippy tile coordinates (Web Mercator)", () => {
    // Zoom 0: whole world is one tile → center of tile space is (0.5, 0.5).
    expect(lngToTileX(0, 0)).toBeCloseTo(0.5, 6);
    expect(latToTileY(0, 0)).toBeCloseTo(0.5, 6);
    // Antimeridian and poles map to the tile-space edges.
    expect(lngToTileX(-180, 0)).toBeCloseTo(0, 6);
    expect(lngToTileX(180, 0)).toBeCloseTo(1, 6);
    // Reference: (52.5°N, 13.4°E) ≈ Berlin at zoom 2 → tile (2.15, 1.31).
    expect(lngToTileX(13.4, 2)).toBeCloseTo(2.148, 2);
    expect(latToTileY(52.5, 2)).toBeCloseTo(1.312, 2);
  });

  it("posterNodeToPdfBlob returns a non-empty PDF blob", async () => {
    const blob = await posterNodeToPdfBlob(document.createElement("div"));
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain("pdf");
    expect(blob.size).toBeGreaterThan(0);
  });
});
