import { useEffect } from "react";
import { createPortal } from "react-dom";

/** Full-screen image viewer. Tap anywhere or press Esc to close. */
export default function Lightbox({ src, alt = "", onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal to <body> so it escapes Leaflet's transformed popup container.
  return createPortal(
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button className="lightbox-close" aria-label="Close image" onClick={onClose}>
        ✕
      </button>
      <img
        className="lightbox-img"
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
