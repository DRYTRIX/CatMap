import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { track } from "../analytics";
import { CAT_COLORS, DEFAULT_FILTERS } from "../lib/filters";
import Modal from "./Modal";
import SegmentedControl from "./SegmentedControl";

/**
 * Bottom-sheet filter panel for the discovery query: date range, color,
 * ear-tipped/stray status, post kind, and minimum cat-detection confidence.
 *
 * Props: value (current filters), onApply(filters), onClose.
 */
export default function FilterPanel({ value, onApply, onClose }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);

  const triStateOptions = [
    { value: "", label: t("filters.any") },
    { value: "true", label: t("common.yes") },
    { value: "false", label: t("common.no") },
  ];
  const kindOptions = [
    { value: "", label: t("filters.typeAll") },
    { value: "sighting", label: t("filters.typeSightings") },
    { value: "missing", label: t("filters.typeMissing") },
  ];

  function set(key, val) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function apply() {
    track("filters_apply", {
      has_date_range: Boolean(draft.since || draft.until),
      color: draft.color || null,
      is_ear_tipped: draft.isEarTipped || null,
      is_stray: draft.isStray || null,
      kind: draft.kind || null,
      min_confidence: draft.minConfidence || 0,
    });
    onApply(draft);
    onClose();
  }

  function reset() {
    track("filters_reset");
    onApply({ ...DEFAULT_FILTERS });
    onClose();
  }

  return (
    <Modal onClose={onClose} labelledBy="filter-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="filter-title">🔎 {t("filters.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="field">
        <label>{t("filters.postedBetween")}</label>
        <div className="row">
          <input
            type="date"
            aria-label={t("filters.fromDate")}
            value={draft.since}
            max={draft.until || undefined}
            onChange={(e) => set("since", e.target.value)}
          />
          <span aria-hidden="true">–</span>
          <input
            type="date"
            aria-label={t("filters.toDate")}
            value={draft.until}
            min={draft.since || undefined}
            onChange={(e) => set("until", e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label>{t("filters.type")}</label>
        <SegmentedControl
          name={t("filters.type")}
          value={draft.kind || ""}
          options={kindOptions}
          onChange={(v) => set("kind", v)}
        />
      </div>

      <div className="field">
        <label htmlFor="filter-color">{t("addSighting.color")}</label>
        <select
          id="filter-color"
          value={draft.color}
          onChange={(e) => set("color", e.target.value)}
        >
          <option value="">{t("filters.any")}</option>
          {CAT_COLORS.map((c) => (
            <option key={c} value={c}>
              {t(`addSighting.colors.${c}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>{t("addSighting.earTipped")}</label>
        <SegmentedControl
          name={t("addSighting.earTipped")}
          value={draft.isEarTipped}
          options={triStateOptions}
          onChange={(v) => set("isEarTipped", v)}
        />
      </div>

      <div className="field">
        <label>{t("addSighting.stray")}</label>
        <SegmentedControl
          name={t("addSighting.stray")}
          value={draft.isStray}
          options={triStateOptions}
          onChange={(v) => set("isStray", v)}
        />
      </div>

      <div className="field">
        <label htmlFor="filter-confidence">
          {t("filters.confidence", { pct: Math.round(draft.minConfidence * 100) })}
        </label>
        <input
          id="filter-confidence"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={draft.minConfidence}
          onChange={(e) => set("minConfidence", Number(e.target.value))}
        />
        <p className="hint">{t("filters.confidenceHint")}</p>
      </div>

      <div className="row wizard-nav">
        <button className="btn btn-ghost btn-block" onClick={reset}>
          {t("filters.reset")}
        </button>
        <button className="btn btn-primary btn-block" onClick={apply}>
          {t("filters.apply")}
        </button>
      </div>
    </Modal>
  );
}
