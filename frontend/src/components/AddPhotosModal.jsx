import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { track } from "../analytics";
import { addSightingPhotos } from "../api";
import { compressImage, formatBytes } from "../lib/image";
import { filterImageFiles } from "../lib/photoGps";
import PhotoPickButton from "./PhotoPickButton";
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
  const { t } = useTranslation();
  const toast = useToast();
  const nextPhotoId = useRef(0);
  // Each photo: { id, file, previewUrl, sizeBefore, sizeAfter, catDetected, possibleAnimal, catCheckError }
  const [photos, setPhotos] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const room = remaining - photos.length;

  async function addFiles(fileList) {
    if (room <= 0) return;
    const incoming = filterImageFiles(fileList).slice(0, room);
    if (incoming.length === 0) return;

    setProcessing(true);
    try {
      for (const f of incoming) {
        const compressed = await compressImage(f);
        // Lazy-load the ONNX detector so onnxruntime-web isn't in the main bundle.
        const { checkForCat } = await import("../lib/catDetection");
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
            possibleAnimal: Boolean(catCheck.possibleAnimal),
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
      toast.success(t("addPhotos.added", { count: photos.length }));
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
  const someNotCat =
    !processing &&
    photos.length > 0 &&
    photos.some((p) => !p.catDetected && !p.possibleAnimal && !p.catCheckError);
  const somePossibleCat =
    !processing &&
    photos.length > 0 &&
    photos.some((p) => p.possibleAnimal) &&
    !photos.some((p) => p.catDetected);

  return (
    <Modal onClose={closeModal} labelledBy="add-photos-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="add-photos-title">📷 {t("addPhotos.title")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={closeModal}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="field">
        <p className="hint">{t("addPhotos.slotsLeft", { count: remaining })}</p>

        {photos.length > 0 ? (
          <div className="photo-grid">
            {photos.map((p) => (
              <div className="photo-grid-item" key={p.id}>
                <img className="photo-grid-img" src={p.previewUrl} alt="Preview" />
                <button
                  type="button"
                  className="photo-grid-remove"
                  aria-label={t("common.remove")}
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
          <PhotoPickButton
            label={
              processing
                ? t("addSighting.processing")
                : photos.length === 0
                  ? `📷 ${t("addSighting.takePhoto")}`
                  : `📷 ${t("addSighting.addAnother", { current: photos.length, max: remaining })}`
            }
            disabled={processing || submitting}
            multiple
            limit={room}
            onFiles={addFiles}
            onError={(e) => toast.error(e.message)}
            style={{ marginTop: 8 }}
          />
        )}

        {photos.length > 0 && (
          <p className="hint">
            {t("addSighting.optimized", {
              before: formatBytes(totalBefore),
              after: formatBytes(totalAfter),
            })}
          </p>
        )}

        {somePossibleCat && (
          <p className="hint photo-req--soft" role="status">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {t("addPhotos.possibleCat")}
          </p>
        )}

        {someNotCat && (
          <p className="hint" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {t("addPhotos.notCat")}
          </p>
        )}

        {submitting && (
          <div className="progress" aria-label={t("addSighting.uploadProgress")}>
            <div className="progress-bar" style={{ width: `${progress}%` }} />
            <span className="progress-label">{progress}%</span>
          </div>
        )}
      </div>

      <div className="row wizard-nav">
        <button className="btn btn-ghost btn-block" onClick={closeModal} disabled={submitting}>
          {t("common.cancel")}
        </button>
        <button
          className="btn btn-primary btn-block"
          onClick={onSubmit}
          disabled={submitting || processing || photos.length === 0}
        >
          {submitting ? t("addPhotos.uploading") : t("addPhotos.submit")}
        </button>
      </div>
    </Modal>
  );
}
