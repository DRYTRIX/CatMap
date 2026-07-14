import { useRef, useState } from "react";
import { track } from "../analytics";
import { createSighting } from "../api";
import { checkForCat } from "../lib/catDetection";
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

const STEPS = ["Photos", "Location", "Details"];
const STEP_KEYS = ["photo", "location", "details"];

// Mirrors MAX_PHOTOS_PER_SIGHTING in backend/app/routers/sightings.py.
const MAX_PHOTOS = 6;

const TRI_STATE_OPTIONS = [
  { value: "", label: "Unknown" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

function getPhotoRequirements({ photos, processing }) {
  const photoStatus = photos.length > 0 ? "met" : "pending";

  let analyzedStatus = "pending";
  if (photos.length > 0 && !processing) {
    analyzedStatus = "met";
  }

  let catLabel = "Cat detected";
  let catStatus = "pending";
  if (photos.length > 0 && !processing) {
    if (photos.some((p) => p.catDetected === true)) {
      catStatus = "met";
    } else if (photos.every((p) => p.catCheckError)) {
      catLabel = "Photo will be reviewed after posting";
      catStatus = "soft";
    } else if (photos.some((p) => p.possibleAnimal)) {
      catLabel = "Possible cat — will be reviewed after posting";
      catStatus = "soft";
    } else {
      catLabel = "No cat detected";
      catStatus = "failed";
    }
  }

  return [
    { id: "photo", label: "Photo added", status: photoStatus },
    { id: "analyzed", label: "Photos analyzed", status: analyzedStatus },
    { id: "cat", label: catLabel, status: catStatus },
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
  const toast = useToast();
  const submittedRef = useRef(false);
  const nextPhotoId = useRef(0);
  const [step, setStep] = useState(0);

  // Each photo: { id, file, previewUrl, sizeBefore, sizeAfter, catDetected, possibleAnimal, catCheckError }
  const [photos, setPhotos] = useState([]);
  const [processing, setProcessing] = useState(false);

  const [location, setLocation] = useState(null);
  const [fromExif, setFromExif] = useState(false);

  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [isEarTipped, setIsEarTipped] = useState("");
  const [isStray, setIsStray] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const photoRequirements = getPhotoRequirements({ photos, processing });
  const photoRequirementsMet = photos.length > 0 && !processing;

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
        onProgress: setProgress,
      });
      submittedRef.current = true;
      if (created.pending) {
        toast.success("Your sighting is under review. We'll check it shortly!");
        onClose();
      } else {
        toast.success("Cat added to the map! 🐱");
        onCreated(created, {
          location_source: fromExif ? "exif" : "manual",
          has_description: Boolean(description.trim()),
          photo_count: photos.length,
          has_attributes: Boolean(color || isEarTipped || isStray),
        });
      }
    } catch (e) {
      toast.error(e.message);
      setSubmitting(false);
    }
  }

  const canNext =
    step === 0 ? photoRequirementsMet : step === 1 ? !!location : true;

  function closeModal() {
    if (!submittedRef.current) {
      track("add_sighting_abandon", { step: STEP_KEYS[step] });
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    }
    onClose();
  }

  function goNext() {
    track("add_sighting_step", { step: STEP_KEYS[step] });
    setStep((s) => s + 1);
  }

  const totalBefore = photos.reduce((sum, p) => sum + p.sizeBefore, 0);
  const totalAfter = photos.reduce((sum, p) => sum + p.sizeAfter, 0);

  return (
    <Modal onClose={closeModal} labelledBy="add-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="add-title">🐱 Add a cat sighting</h2>
        <button className="icon-btn" aria-label="Close" onClick={closeModal}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
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
                        aria-label="Remove photo"
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
                      ? "Processing…"
                      : photos.length === 0
                        ? "📷 Take or choose a photo"
                        : `📷 Add another photo (${photos.length}/${MAX_PHOTOS})`
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
                  Optimized {formatBytes(totalBefore)} → {formatBytes(totalAfter)} for a
                  faster upload.
                </p>
              )}
            </div>

            <div className="photo-requirements-col">
              <p className="photo-reqs-title">Photo requirements</p>
              <ul className="photo-reqs" aria-live="polite">
                {photoRequirements.map((req) => (
                  <li
                    key={req.id}
                    className={`photo-req photo-req--${req.status}`}
                    aria-label={`${req.label}: ${req.status}`}
                  >
                    <PhotoRequirementIcon status={req.status} />
                    <span>{req.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Location */}
      {step === 1 && (
        <div className="field">
          <label>
            Location {fromExif && <span className="gps-badge">from photo GPS</span>}
          </label>
          <p className="hint">
            {fromExif
              ? "Found GPS in the photo. Drag the pin to fine-tune."
              : isMobile()
                ? "Your phone may have removed location data from the photo — use My location or drop a pin."
                : "No GPS in this photo — drop a pin or use your location."}
          </p>
          <LocationPicker value={location} onChange={setLocation} />
        </div>
      )}

      {/* Step 3: Details */}
      {step === 2 && (
        <div className="field">
          <label htmlFor="desc">Description</label>
          <textarea
            id="desc"
            placeholder="Orange tabby napping by the bakery…"
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="hint char-count">{description.length}/1000</p>

          <label htmlFor="add-color">Color / pattern</label>
          <select id="add-color" value={color} onChange={(e) => setColor(e.target.value)}>
            <option value="">Unknown</option>
            {CAT_COLORS.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>

          <label>Ear-tipped (TNR)</label>
          <SegmentedControl
            name="Ear-tipped"
            value={isEarTipped}
            options={TRI_STATE_OPTIONS}
            onChange={setIsEarTipped}
          />

          <label>Stray</label>
          <SegmentedControl
            name="Stray"
            value={isStray}
            options={TRI_STATE_OPTIONS}
            onChange={setIsStray}
          />

          {submitting && (
            <div className="progress" aria-label="Upload progress">
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
            Back
          </button>
        ) : (
          <button className="btn btn-ghost btn-block" onClick={closeModal}>
            Cancel
          </button>
        )}

        {step < STEPS.length - 1 ? (
          <button
            className="btn btn-primary btn-block"
            onClick={goNext}
            disabled={!canNext}
          >
            Next
          </button>
        ) : (
          <button
            className="btn btn-primary btn-block"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "Posting…" : "Post sighting"}
          </button>
        )}
      </div>
    </Modal>
  );
}
