import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { track } from "../analytics";
import { createSighting } from "../api";
import { isNetworkError, queueSighting, serializeFiles } from "../lib/offlineQueue";
import { compressImage, formatBytes } from "../lib/image";
import {
  filterImageFiles,
  isMobile,
  readGpsFromFile,
} from "../lib/photoGps";
import PhotoPickButton from "./PhotoPickButton";
import { CAT_COLORS } from "../lib/filters";
import LocationPicker from "./LocationPicker";
import Modal from "./Modal";
import SegmentedControl from "./SegmentedControl";
import { useToast } from "./Toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCheck, faCircle, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

const STEP_KEYS = ["photo", "location", "details"];

// Mirrors MAX_PHOTOS_PER_SIGHTING in backend/app/routers/sightings.py.
const MAX_PHOTOS = 6;

const TRI_STATE_KEYS = [
  { value: "", labelKey: "common.unknown" },
  { value: "true", labelKey: "common.yes" },
  { value: "false", labelKey: "common.no" },
];

const KIND_OPTIONS = [
  { value: "sighting", labelKey: "addSighting.kindSighting" },
  { value: "missing", labelKey: "addSighting.kindMissing" },
];

// Returns requirement rows with i18n keys (resolved by the component via `t`)
// rather than baked-in English.
function getPhotoRequirements({ photos, processing }) {
  const photoStatus = photos.length > 0 ? "met" : "pending";

  let analyzedStatus = "pending";
  if (photos.length > 0 && !processing) {
    analyzedStatus = "met";
  }

  let catKey = "reqCatDetected";
  let catStatus = "pending";
  if (photos.length > 0 && !processing) {
    if (photos.some((p) => p.catDetected === true)) {
      catStatus = "met";
    } else if (photos.every((p) => p.catCheckError)) {
      catKey = "reqCatPending";
      catStatus = "soft";
    } else if (photos.some((p) => p.possibleAnimal)) {
      catKey = "reqCatReview";
      catStatus = "soft";
    } else {
      catKey = "reqNoCat";
      catStatus = "failed";
    }
  }

  return [
    { id: "photo", labelKey: "reqPhoto", status: photoStatus },
    { id: "analyzed", labelKey: "reqAnalyzed", status: analyzedStatus },
    { id: "cat", labelKey: catKey, status: catStatus },
  ];
}

function PhotoRequirementIcon({ status }) {
  if (status === "met") {
    return <FontAwesomeIcon icon={faCheck} className="photo-req-icon" aria-hidden="true" />;
  }
  if (status === "failed") {
    return <FontAwesomeIcon icon={faXmark} className="photo-req-icon" aria-hidden="true" />;
  }
  if (status === "soft") {
    return (
      <FontAwesomeIcon icon={faTriangleExclamation} className="photo-req-icon" aria-hidden="true" />
    );
  }
  return <FontAwesomeIcon icon={faCircle} className="photo-req-icon" aria-hidden="true" />;
}

export default function AddSightingModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const toast = useToast();
  const submittedRef = useRef(false);
  const nextPhotoId = useRef(0);
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState("sighting");

  // Each photo: { id, file, previewUrl, sizeBefore, sizeAfter, catDetected, possibleAnimal, catCheckError }
  const [photos, setPhotos] = useState([]);
  const [processing, setProcessing] = useState(false);

  const [location, setLocation] = useState(null);
  const [fromExif, setFromExif] = useState(false);

  const [description, setDescription] = useState("");
  const [catName, setCatName] = useState("");
  const [contact, setContact] = useState("");
  const [contactPublic, setContactPublic] = useState(false);
  const [color, setColor] = useState("");
  const [isEarTipped, setIsEarTipped] = useState("");
  const [isStray, setIsStray] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const isMissing = kind === "missing";
  const photoRequirements = getPhotoRequirements({ photos, processing });
  const photoRequirementsMet = photos.length > 0 && !processing;

  const STEPS = [
    t("addSighting.steps.photos"),
    t("addSighting.steps.location"),
    t("addSighting.steps.details"),
  ];
  const TRI_STATE_OPTIONS = TRI_STATE_KEYS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));

  async function addFiles(fileList) {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    const incoming = filterImageFiles(fileList).slice(0, room);
    if (incoming.length === 0) return;

    const isFirstBatch = photos.length === 0;
    const hadLocation = Boolean(location);
    let gpsFound = hadLocation;
    setProcessing(true);
    try {
      for (let i = 0; i < incoming.length; i++) {
        const f = incoming[i];

        // Read GPS from ORIGINAL bytes (compression strips EXIF). Scan every
        // photo in the batch until coordinates are found.
        if (!gpsFound) {
          const gps = await readGpsFromFile(f);
          if (gps) {
            setLocation({ lat: gps.latitude, lng: gps.longitude });
            setFromExif(true);
            gpsFound = true;
            track("exif_gps_read", { found: true, error: false, photo_index: i });
          }
        }

        const compressed = await compressImage(f);
        // Lazy-load the ONNX detector so onnxruntime-web isn't in the main bundle.
        const { checkForCat } = await import("../lib/catDetection");
        const catCheck = await checkForCat(compressed);
        track("add_sighting_client_cat_check", {
          detected: catCheck.detected,
          score: catCheck.score,
          animal_score: catCheck.animalScore,
          error: Boolean(catCheck.error),
        });

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

      if (!gpsFound && isFirstBatch && !hadLocation) {
        track("exif_gps_read", { found: false, error: false });
        setFromExif(false);
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
      const created = await createSighting({
        files: photos.map((p) => p.file),
        lat: location.lat,
        lng: location.lng,
        description,
        color,
        isEarTipped,
        isStray,
        kind,
        catName: isMissing ? catName : "",
        contact: isMissing ? contact : "",
        contactPublic: isMissing ? contactPublic : false,
        onProgress: setProgress,
      });
      submittedRef.current = true;
      if (created.pending) {
        toast.success(t("addSighting.pendingReview"));
        onClose();
      } else {
        toast.success(isMissing ? t("addSighting.missingSuccess") : t("addSighting.success"));
        onCreated(created, {
          location_source: fromExif ? "exif" : "manual",
          has_description: Boolean(description.trim()),
          photo_count: photos.length,
          has_attributes: Boolean(color || isEarTipped || isStray),
          kind,
        });
      }
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          const files = await serializeFiles(photos.map((p) => p.file));
          await queueSighting({
            files,
            lat: location.lat,
            lng: location.lng,
            description,
            color,
            isEarTipped,
            isStray,
            kind,
            catName: isMissing ? catName : "",
            contact: isMissing ? contact : "",
            contactPublic: isMissing ? contactPublic : false,
          });
          submittedRef.current = true;
          toast.success(t("offline.queued"));
          onClose();
          return;
        } catch {
          /* fall through */
        }
      }
      toast.error(e.message);
      setSubmitting(false);
    }
  }

  const canNext =
    step === 0 ? photoRequirementsMet : step === 1 ? !!location : true;

  function closeModal() {
    if (!submittedRef.current) {
      track("add_sighting_abandon", { step: STEP_KEYS[step], kind });
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    }
    onClose();
  }

  function goNext() {
    track("add_sighting_step", { step: STEP_KEYS[step], kind });
    setStep((s) => s + 1);
  }

  const totalBefore = photos.reduce((sum, p) => sum + p.sizeBefore, 0);
  const totalAfter = photos.reduce((sum, p) => sum + p.sizeAfter, 0);

  return (
    <Modal onClose={closeModal} labelledBy="add-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="add-title">
          {isMissing ? t("addSighting.titleMissing") : t("addSighting.title")}
        </h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={closeModal}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>{t("addSighting.kindLabel")}</label>
        <SegmentedControl
          name={t("addSighting.kindLabel")}
          value={kind}
          options={KIND_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
          onChange={setKind}
        />
      </div>

      <ol className="steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
            aria-current={i === step ? "step" : undefined}
          >
            <span className="step-dot" aria-hidden="true">
              {i < step ? <FontAwesomeIcon icon={faCheck} /> : i + 1}
            </span>
            <span className="step-label">{label}</span>
          </li>
        ))}
      </ol>

      {/* Step 1: Photos */}
      {step === 0 && (
        <div className="field">
          <div className="photo-step">
            <div className="photo-preview-col">
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
                        disabled={processing}
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

              {photos.length < MAX_PHOTOS && (
                <PhotoPickButton
                  label={
                    processing
                      ? t("addSighting.processing")
                      : photos.length === 0
                        ? `📷 ${t("addSighting.takePhoto")}`
                        : `📷 ${t("addSighting.addAnother", { current: photos.length, max: MAX_PHOTOS })}`
                  }
                  disabled={processing}
                  multiple
                  limit={MAX_PHOTOS - photos.length}
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
            </div>

            <div className="photo-requirements-col">
              <p className="photo-reqs-title">{t("addSighting.photoRequirements")}</p>
              <ul className="photo-reqs" aria-live="polite">
                {photoRequirements.map((req) => {
                  const label = t(`addSighting.${req.labelKey}`);
                  return (
                    <li
                      key={req.id}
                      className={`photo-req photo-req--${req.status}`}
                      aria-label={`${label}: ${req.status}`}
                    >
                      <PhotoRequirementIcon status={req.status} />
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Location */}
      {step === 1 && (
        <div className="field">
          <label>
            {isMissing ? t("addSighting.locationMissing") : t("addSighting.location")}{" "}
            {fromExif && <span className="gps-badge">{t("addSighting.fromGps")}</span>}
          </label>
          <p className="hint">
            {isMissing
              ? t("addSighting.locationMissingHint")
              : fromExif
                ? t("addSighting.gpsFound")
                : isMobile()
                  ? t("addSighting.gpsMobile")
                  : t("addSighting.gpsManual")}
          </p>
          <LocationPicker value={location} onChange={setLocation} />
        </div>
      )}

      {/* Step 3: Details */}
      {step === 2 && (
        <div className="field">
          <label htmlFor="desc">{t("addSighting.description")}</label>
          <textarea
            id="desc"
            placeholder={
              isMissing
                ? t("addSighting.descriptionPlaceholderMissing")
                : t("addSighting.descriptionPlaceholder")
            }
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="hint char-count">{description.length}/1000</p>

          {isMissing && (
            <>
              <label htmlFor="cat-name">{t("addSighting.catName")}</label>
              <input
                id="cat-name"
                type="text"
                placeholder={t("addSighting.catNamePlaceholder")}
                value={catName}
                maxLength={50}
                onChange={(e) => setCatName(e.target.value)}
              />

              <label htmlFor="contact">{t("addSighting.contact")}</label>
              <input
                id="contact"
                type="text"
                placeholder={t("addSighting.contactPlaceholder")}
                value={contact}
                maxLength={200}
                onChange={(e) => setContact(e.target.value)}
              />
              <p className="hint">{t("addSighting.contactHint")}</p>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={contactPublic}
                  onChange={(e) => setContactPublic(e.target.checked)}
                />
                {t("addSighting.contactPublic")}
              </label>
            </>
          )}

          <label htmlFor="add-color">{t("addSighting.color")}</label>
          <select id="add-color" value={color} onChange={(e) => setColor(e.target.value)}>
            <option value="">{t("addSighting.colorUnknown")}</option>
            {CAT_COLORS.map((c) => (
              <option key={c} value={c}>
                {t(`addSighting.colors.${c}`)}
              </option>
            ))}
          </select>

          <label>{t("addSighting.earTipped")}</label>
          <SegmentedControl
            name={t("addSighting.earTipped")}
            value={isEarTipped}
            options={TRI_STATE_OPTIONS}
            onChange={setIsEarTipped}
          />

          {!isMissing && (
            <>
              <label>{t("addSighting.stray")}</label>
              <SegmentedControl
                name={t("addSighting.stray")}
                value={isStray}
                options={TRI_STATE_OPTIONS}
                onChange={setIsStray}
              />
            </>
          )}

          {submitting && (
            <div className="progress" aria-label={t("addSighting.uploadProgress")}>
              <div className="progress-bar" style={{ width: `${progress}%` }} />
              <span className="progress-label">{progress}%</span>
            </div>
          )}
        </div>
      )}

      <div className="row wizard-nav">
        {step > 0 ? (
          <button
            className="btn btn-ghost btn-block"
            onClick={() => setStep((s) => s - 1)}
            disabled={submitting}
          >
            {t("common.back")}
          </button>
        ) : (
          <button className="btn btn-ghost btn-block" onClick={closeModal}>
            {t("common.cancel")}
          </button>
        )}

        {step < STEPS.length - 1 ? (
          <button
            className="btn btn-primary btn-block"
            onClick={goNext}
            disabled={!canNext}
          >
            {t("common.next")}
          </button>
        ) : (
          <button
            className="btn btn-primary btn-block"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting
              ? t("addSighting.posting")
              : isMissing
                ? t("addSighting.postMissing")
                : t("addSighting.post")}
          </button>
        )}
      </div>
    </Modal>
  );
}
