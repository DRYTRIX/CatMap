import { useRef, useState } from "react";
import { track } from "../analytics";
import exifr from "exifr";
import { createSighting } from "../api";
import { compressImage, formatBytes } from "../lib/image";
import LocationPicker from "./LocationPicker";
import Modal from "./Modal";
import { useToast } from "./Toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCheck } from "@fortawesome/free-solid-svg-icons";

const STEPS = ["Photo", "Location", "Details"];
const STEP_KEYS = ["photo", "location", "details"];

export default function AddSightingModal({ onClose, onCreated }) {
  const toast = useToast();
  const submittedRef = useRef(false);
  const [step, setStep] = useState(0);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [sizes, setSizes] = useState(null); // { before, after }
  const [processing, setProcessing] = useState(false);

  const [location, setLocation] = useState(null);
  const [fromExif, setFromExif] = useState(false);

  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  async function onFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setProcessing(true);
    try {
      // 1) Read GPS from the ORIGINAL (compression strips EXIF).
      let gps = null;
      try {
        gps = await exifr.gps(f);
      } catch {
        /* no exif */
      }
      if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
        setLocation({ lat: gps.latitude, lng: gps.longitude });
        setFromExif(true);
      } else {
        setFromExif(false);
        setLocation(null);
      }

      // 2) Compress for upload.
      const compressed = await compressImage(f);
      setFile(compressed);
      setSizes({ before: f.size, after: compressed.size });
      setPreviewUrl(URL.createObjectURL(compressed));
    } finally {
      setProcessing(false);
    }
  }

  async function onSubmit() {
    setSubmitting(true);
    setProgress(0);
    try {
      const created = await createSighting({
        file,
        lat: location.lat,
        lng: location.lng,
        description,
        onProgress: setProgress,
      });
      submittedRef.current = true;
      toast.success("Cat added to the map! 🐱");
      onCreated(created, {
        location_source: fromExif ? "exif" : "manual",
        has_description: Boolean(description.trim()),
      });
    } catch (e) {
      toast.error(e.message);
      setSubmitting(false);
    }
  }

  const canNext = step === 0 ? !!file && !processing : step === 1 ? !!location : true;

  function closeModal() {
    if (!submittedRef.current) {
      track("add_sighting_abandon", { step: STEP_KEYS[step] });
    }
    onClose();
  }

  function goNext() {
    track("add_sighting_step", { step: STEP_KEYS[step] });
    setStep((s) => s + 1);
  }

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

      {/* Step 1: Photo */}
      {step === 0 && (
        <div className="field">
          {previewUrl && <img className="preview-img" src={previewUrl} alt="Preview" />}
          <label className="btn btn-ghost btn-block" style={{ marginTop: 8 }}>
            {processing
              ? "Processing…"
              : file
                ? "Choose a different photo"
                : "📷 Take or choose a photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={onFileChange}
            />
          </label>
          {sizes && (
            <p className="hint">
              Optimized {formatBytes(sizes.before)} → {formatBytes(sizes.after)} for
              a faster upload.
            </p>
          )}
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
