import { describe, expect, it } from "vitest";
import { contactHref } from "./MissingCard";

describe("contactHref", () => {
  it("links emails and phone numbers", () => {
    expect(contactHref("me@example.com")).toBe("mailto:me@example.com");
    expect(contactHref("+32 470 12 34 56")).toBe("tel:+32470123456");
  });

  it("returns null for free text", () => {
    expect(contactHref("ask at the bakery")).toBeNull();
    expect(contactHref("")).toBeNull();
    expect(contactHref(null)).toBeNull();
  });
});
