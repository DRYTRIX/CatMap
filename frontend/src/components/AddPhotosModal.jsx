import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { track } from "../analytics";
import { addSightingPhotos } from "../api";
import { checkForCat } from "../lib/catDetection";
import { compressImage, formatBytes } from "../lib/image";
import Modal from "./Modal";
import { useToast } from "./Toast";

/**
 * Upload additional photos to an existing sighting (community contribution).
 *
 * Props:
 *   sighting  – current SightingDetail (needs `id`)
 *   remaining – how many more photos may be added (1..5)
 *   onClose   – close the modal
 *   onAdded(updatedDetail) – called with the refreshed sighting on success
 */
export default function AddPhotosModal({ sighting, remaining, onClose, onAdded }) {
  const toast = useToast();
  const nextPhotoId = useRef(0);
  // Each photo: { id, file, previewUrl, sizeBefore, sizeAfter, catDetected, catCheckError }
  const [photos, setPhotos] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const room = remaining - photos.length;

  async function addFiles(fileList) {
    if (room <= 0) return;
    const incoming = Array.from(fileList).slice(0, room);
    if (incoming.length === 0) return;

    setProcessing(true);
    try {
      for (const f of incoming) {
        const compressed = await compressImage(f);
        const catCheck = await checkForCat(compressed);
        const id = nextPhotoId.current++;
        setPhotos((prev) => [
          ...prev,
          {
            id,
            file: compressed,
            previewUrl: URL.createObjectURL(compressed),
            sizeBefore: f.size,
            sizeAfter: compressed.size,
            catDetected: catCheck.detected,
            catCheckError: Boolean(catCheck.error),
          },
        ]);
      }
    } finally {
      setProcessing(false);
    }
  }

  function removePhoto(id) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function onSubmit() {
    setSubmitting(true);
    setProgress(0);
    try {
      const updated = await addSightingPhotos(
        sighting.id,
        photos.map((p) => p.file),
        setProgress,
      );
      track("sighting_photos_added", { photo_count: photos.length });
      toast.success(photos.length === 1 ? "Photo added!" : "Photos added!");
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
      onAdded(updated);
    } catch (e) {
      toast.error(e.message);
      setSubmitting(false);
    }
  }

  function closeModal() {
    for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    onClose();
  }

  const totalBefore = photos.reduce((sum, p) => sum + p.sizeBefore, 0);
  const totalAfter = photos.reduce((sum, p) => sum + p.sizeAfter, 0);
  // Soft warning: production rejects non-cat uploads, so flag them early.
  const someNotCat =
    !processing && photos.length > 0 && photos.some((p) => !p.catDetected && !p.catCheckError);

  return (
    <Modal onClose={closeModal} labelledBy="add-photos-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="add-photos-title">📷 Add photos</h2>
        <button className="icon-btn" aria-label="Close" onClick={closeModal}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="field">
        <p className="hint">
          Help keep this cat up to date by adding more photos. {remaining} slot
          {remaining === 1 ? "" : "s"} left.
        </p>

        {photos.length > 0 ? (
          <div className="photo-grid">
            {photos.map((p) => (
              <div className="photo-grid-item" key={p.id}>
                <img className="photo-grid-img" src={p.previewUrl} alt="Preview" />
                <button
                  type="button"
                  className="photo-grid-remove"
                  aria-label="Remove photo"
                  onClick={() => removePhoto(p.id)}
                  disabled={processing || submitting}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="photo-placeholder" aria-hidden="true">
            📷
          </div>
        )}

        {room > 0 && (
          <label className="btn btn-ghost btn-block" style={{ marginTop: 8 }}>
            {processing
              ? "Processing…"
              : photos.length === 0
                ? "📷 Take or choose a photo"
                : `📷 Add another photo (${photos.length}/${remaining})`}
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              disabled={submitting}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}

        {photos.length > 0 && (
          <p className="hint">
            Optimized {formatBytes(totalBefore)} → {formatBytes(totalAfter)} for a faster
            upload.
          </p>
        )}

        {someNotCat && (
          <p className="hint" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> We couldn't spot a cat in one of
            these — photos without a cat may be rejected.
          </p>
        )}

        {submitting && (
          <div className="progress" aria-label="Upload progress">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
            <span className="progress-label">{progress}%</span>
          </div>
        )}
      </div>

      <div className="row wizard-nav">
        <button className="btn btn-ghost btn-block" onClick={closeModal} disabled={submitting}>
          Cancel
        </button>
        <button
          className="btn btn-primary btn-block"
          onClick={onSubmit}
          disabled={submitting || processing || photos.length === 0}
        >
          {submitting ? "Uploading…" : "Add photos"}
        </button>
      </div>
    </Modal>
  );
}
