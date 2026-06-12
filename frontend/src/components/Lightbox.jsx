import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";

/**
 * Full-screen image viewer. Tap the backdrop or press Esc to close.
 *
 * Pass either a single `src`, or an `images` array plus `index` + `onNavigate`
 * for a swipeable/arrow-key gallery.
 */
export default function Lightbox({ src, images, index = 0, alt = "", onClose, onNavigate }) {
  const gallery = images && images.length > 1;
  const current = gallery ? images[index] : { src, alt };

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      else if (gallery && e.key === "ArrowLeft") {
        onNavigate((index - 1 + images.length) % images.length);
      } else if (gallery && e.key === "ArrowRight") {
        onNavigate((index + 1) % images.length);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, gallery, index, images, onNavigate]);

  // Portal to <body> so it escapes Leaflet's transformed popup container.
  return createPortal(
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button className="lightbox-close" aria-label="Close image" onClick={onClose}>
        ✕
      </button>
      <img
        className="lightbox-img"
        src={current.src}
        alt={current.alt || alt}
        onClick={(e) => e.stopPropagation()}
      />
      {gallery && (
        <>
          <button
            className="lightbox-nav lightbox-prev"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate((index - 1 + images.length) % images.length);
            }}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            className="lightbox-nav lightbox-next"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate((index + 1) % images.length);
            }}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
          <div className="lightbox-counter" aria-hidden="true">
            {index + 1} / {images.length}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
