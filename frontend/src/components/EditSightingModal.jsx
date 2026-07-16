import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { track } from "../analytics";
import { updateSighting } from "../api";
import { CAT_COLORS } from "../lib/filters";
import Modal from "./Modal";
import SegmentedControl from "./SegmentedControl";
import { useToast } from "./Toast";

const TRI_STATE_OPTIONS = [
  { value: "", label: "Unknown" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

function boolToTri(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  return "";
}

/**
 * Edit a sighting's description and attributes (creator-only).
 *
 * Props: data (current SightingDetail), onClose, onSaved(updatedDetail).
 */
export default function EditSightingModal({ data, onClose, onSaved }) {
  const { t } = useTranslation();
  const toast = useToast();
  const isMissing = data.kind === "missing";
  const [description, setDescription] = useState(data.description || "");
  const [catName, setCatName] = useState(data.cat_name || "");
  const [contact, setContact] = useState(data.contact || "");
  const [color, setColor] = useState(data.color || "");
  const [isEarTipped, setIsEarTipped] = useState(boolToTri(data.is_ear_tipped));
  const [isStray, setIsStray] = useState(boolToTri(data.is_stray));
  const [saving, setSaving] = useState(false);

  async function onSubmit() {
    setSaving(true);
    try {
      const fields = { description, color };
      if (isMissing) {
        fields.cat_name = catName;
        fields.contact = contact;
      }
      if (isEarTipped !== "") fields.is_ear_tipped = isEarTipped;
      if (isStray !== "") fields.is_stray = isStray;

      const updated = await updateSighting(data.id, fields);
      track("sighting_edit");
      toast.success(t("sighting.editSuccess"));
      onSaved(updated);
    } catch (e) {
      toast.error(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="edit-title" className="sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="edit-title">✏️ Edit sighting</h2>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="field">
        <label htmlFor="edit-desc">Description</label>
        <textarea
          id="edit-desc"
          placeholder="Orange tabby napping by the bakery…"
          value={description}
          maxLength={1000}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="hint char-count">{description.length}/1000</p>
      </div>

      {isMissing && (
        <>
          <div className="field">
            <label htmlFor="edit-cat-name">{t("addSighting.catName")}</label>
            <input
              id="edit-cat-name"
              type="text"
              value={catName}
              maxLength={50}
              onChange={(e) => setCatName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-contact">{t("addSighting.contact")}</label>
            <input
              id="edit-contact"
              type="text"
              value={contact}
              maxLength={200}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="edit-color">Color / pattern</label>
        <select id="edit-color" value={color} onChange={(e) => setColor(e.target.value)}>
          <option value="">Unknown</option>
          {CAT_COLORS.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Ear-tipped (TNR)</label>
        <SegmentedControl
          name="Ear-tipped"
          value={isEarTipped}
          options={TRI_STATE_OPTIONS}
          onChange={setIsEarTipped}
        />
      </div>

      <div className="field">
        <label>Stray</label>
        <SegmentedControl
          name="Stray"
          value={isStray}
          options={TRI_STATE_OPTIONS}
          onChange={setIsStray}
        />
      </div>

      <div className="row wizard-nav">
        <button className="btn btn-ghost btn-block" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary btn-block" onClick={onSubmit} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}
