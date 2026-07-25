import { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

// Shared stack of open modals. Nested modals (e.g. a ConfirmDialog rendered
// inside an already-open SightingSheet) mount two Modal instances at once, so
// we gate Escape on the topmost one and reference-count the body scroll lock —
// otherwise one Escape closes both, and the inner unmount restores the wrong
// overflow value.
const modalStack = [];
let scrollLockPrev = "";
let idSeq = 0;

function isTopmost(id) {
  return modalStack[modalStack.length - 1] === id;
}

/**
 * Accessible modal: backdrop, role=dialog, focus trap, Esc-to-close,
 * body scroll lock. Children render inside the panel.
 */
export default function Modal({ onClose, labelledBy, className = "sheet", children }) {
  const panelRef = useRef(null);
  const idRef = useRef(++idSeq);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    const id = idRef.current;
    modalStack.push(id);
    if (modalStack.length === 1) {
      scrollLockPrev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    function onKey(e) {
      // Only the topmost modal reacts to Escape, so a single press doesn't
      // cascade through every stacked modal.
      if (e.key === "Escape" && isTopmost(id)) onClose();
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = modalStack.indexOf(id);
      if (i !== -1) modalStack.splice(i, 1);
      if (modalStack.length === 0) {
        document.body.style.overflow = scrollLockPrev;
      }
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
