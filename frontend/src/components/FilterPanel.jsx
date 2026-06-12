import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { track } from "../analytics";
import { CAT_COLORS, DEFAULT_FILTERS } from "../lib/filters";
import Modal from "./Modal";
import SegmentedControl from "./SegmentedControl";

const TRI_STATE_OPTIONS = [
  { value: "", label: "Any" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

/**
 * Bottom-sheet filter panel for the discovery query: date range, color,
 * ear-tipped/stray status, and minimum cat-detection confidence.
 *
 * Props: value (current filters), onApply(filters), onClose.
 */
export default function FilterPanel({ value, onApply, onClose }) {
  const [draft, setDraft] = useState(value);

  function set(key, val) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function apply() {
    track("filters_apply", {
      has_date_range: Boolean(draft.since || draft.until),
      color: draft.color || null,
      is_ear_tipped: draft.isEarTipped || null,
      is_stray: draft.isStray || null,
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
        <h2 id="filter-title">🔎 Filter cats</h2>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="field">
        <label>Posted between</label>
        <div className="row">
          <input
            type="date"
            aria-label="From date"
            value={draft.since}
            max={draft.until || undefined}
            onChange={(e) => set("since", e.target.value)}
          />
          <span aria-hidden="true">–</span>
          <input
            type="date"
            aria-label="To date"
            value={draft.until}
            min={draft.since || undefined}
            onChange={(e) => set("until", e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="filter-color">Color / pattern</label>
        <select
          id="filter-color"
          value={draft.color}
          onChange={(e) => set("color", e.target.value)}
        >
          <option value="">Any</option>
          {CAT_COLORS.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Ear-tipped (TNR)</label>
        <SegmentedControl
          name="Ear-tipped"
          value={draft.isEarTipped}
          options={TRI_STATE_OPTIONS}
          onChange={(v) => set("isEarTipped", v)}
        />
      </div>

      <div className="field">
        <label>Stray</label>
        <SegmentedControl
          name="Stray"
          value={draft.isStray}
          options={TRI_STATE_OPTIONS}
          onChange={(v) => set("isStray", v)}
        />
      </div>

      <div className="field">
        <label htmlFor="filter-confidence">
          Min. cat-detection confidence: {Math.round(draft.minConfidence * 100)}%
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
        <p className="hint">
          Higher values hide sightings the detector was less confident about.
        </p>
      </div>

      <div className="row wizard-nav">
        <button className="btn btn-ghost btn-block" onClick={reset}>
          Reset
        </button>
        <button className="btn btn-primary btn-block" onClick={apply}>
          Apply
        </button>
      </div>
    </Modal>
  );
}
