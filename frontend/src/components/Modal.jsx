import { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

/**
 * Accessible modal: backdrop, role=dialog, focus trap, Esc-to-close,
 * body scroll lock. Children render inside the panel.
 */
export default function Modal({ onClose, labelledBy, className = "sheet", children }) {
  const panelRef = useRef(null);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
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
