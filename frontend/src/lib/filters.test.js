import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  filtersToParams,
  loadFilters,
  saveFilters,
} from "./filters";

describe("filters", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadFilters returns the defaults when nothing is stored", () => {
    expect(loadFilters()).toEqual(DEFAULT_FILTERS);
  });

  it("saveFilters persists and loadFilters restores them", () => {
    const filters = { ...DEFAULT_FILTERS, color: "tabby", minConfidence: 0.5 };
    saveFilters(filters);
    expect(loadFilters()).toEqual(filters);
  });

  it("loadFilters falls back to defaults on corrupt storage", () => {
    localStorage.setItem("catmap_filters", "{not json");
    expect(loadFilters()).toEqual(DEFAULT_FILTERS);
  });

  it("countActiveFilters only counts set fields", () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(
      countActiveFilters({ ...DEFAULT_FILTERS, color: "black", isStray: "true", minConfidence: 0.3 })
    ).toBe(3);
  });

  it("filtersToParams omits unset filters", () => {
    expect(filtersToParams(DEFAULT_FILTERS)).toEqual({});
  });

  it("filtersToParams converts dates and maps field names", () => {
    const params = filtersToParams({
      ...DEFAULT_FILTERS,
      since: "2026-01-01",
      until: "2026-01-31",
      color: "black",
      isEarTipped: "true",
      isStray: "false",
      minConfidence: 0.5,
    });

    expect(params.since).toBe(new Date("2026-01-01T00:00:00").toISOString());
    expect(params.until).toBe(new Date("2026-01-31T23:59:59.999").toISOString());
    expect(params.color).toBe("black");
    expect(params.is_ear_tipped).toBe("true");
    expect(params.is_stray).toBe("false");
    expect(params.min_confidence).toBe(0.5);
  });
});
