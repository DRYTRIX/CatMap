import { describe, expect, it } from "vitest";
import de from "../locales/de.json";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import nl from "../locales/nl.json";

function leafKeys(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...leafKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe("i18n completeness", () => {
  const enKeys = new Set(leafKeys(en));

  it.each([
    ["de", de],
    ["fr", fr],
    ["nl", nl],
  ])("%s has every English key", (_lang, locale) => {
    const missing = [...enKeys].filter((k) => !leafKeys(locale).includes(k));
    expect(missing, `missing keys: ${missing.join(", ")}`).toEqual([]);
  });
});
