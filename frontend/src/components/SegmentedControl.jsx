/** Radiogroup of buttons, used for tri-state (Any/Yes/No) style fields. */
export default function SegmentedControl({ name, value, options, onChange }) {
  const noneChecked = !options.some((o) => o.value === value);

  function onKeyDown(e, idx) {
    let nextIdx = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIdx = (idx + 1) % options.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIdx = (idx - 1 + options.length) % options.length;
    }
    if (nextIdx === null) return;
    e.preventDefault();
    onChange(options[nextIdx].value);
    const buttons = e.currentTarget.parentElement.querySelectorAll('[role="radio"]');
    buttons[nextIdx]?.focus();
  }

  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {options.map((opt, idx) => {
        const checked = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            // Roving tabindex: only the checked option (or the first, when none
            // is checked) is in the tab order; arrow keys move between options.
            tabIndex={checked || (noneChecked && idx === 0) ? 0 : -1}
            className={`segmented-opt ${checked ? "is-active" : ""}`}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
