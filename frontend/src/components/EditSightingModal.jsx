import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { track } from "../analytics";
import { updateSighting } from "../api";
import { CAT_COLORS } from "../lib/filters";
import Modal from "./Modal";
import SegmentedControl from "./SegmentedControl";
import LocationPicker from "./LocationPicker";
import { useToast } from "./Toast";

const TRI_STATE_KEYS = [
  { value: "", labelKey: "common.unknown" },
  { value: "true", labelKey: "common.yes" },
  { value: "false", labelKey: "common.no" },
];

function boolToTri(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  return "";
}

/**
 * Edit a sighting's description, attributes, and location (creator-only).
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
  const [contactPublic, setContactPublic] = useState(Boolean(data.contact_public));
  const [color, setColor] = useState(data.color || "");
  const [isEarTipped, setIsEarTipped] = useState(boolToTri(data.is_ear_tipped));
  const [isStray, setIsStray] = useState(boolToTri(data.is_stray));
  const [location, setLocation] = useState({ lat: data.lat, lng: data.lng });
  const [saving, setSaving] = useState(false);

  const triStateOptions = TRI_STATE_KEYS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));

  async function onSubmit() {
    setSaving(true);
    try {
      const fields = { description, color };
      if (location?.lat != null && location?.lng != null) {
        fields.lat = location.lat;
        fields.lng = location.lng;
      }
      if (isMissing) {
        fields.cat_name = catName;
        fields.contact = contact;
        fields.contact_public = contactPublic;
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
        <h2 id="edit-title">✏️ {t("sighting.editTitle")}</h2>
        <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="field">
        <label htmlFor="edit-desc">{t("addSighting.description")}</label>
        <textarea
          id="edit-desc"
          placeholder={t("addSighting.descriptionPlaceholder")}
          value={description}
          maxLength={1000}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="hint char-count">{description.length}/1000</p>
      </div>

      <div className="field">
        <label>{t("sighting.editLocation")}</label>
        <LocationPicker value={location} onChange={setLocation} />
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
            <p className="hint">{t("addSighting.contactHint")}</p>
          </div>
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

      <div className="field">
        <label htmlFor="edit-color">{t("addSighting.color")}</label>
        <select id="edit-color" value={color} onChange={(e) => setColor(e.target.value)}>
          <option value="">{t("addSighting.colorUnknown")}</option>
          {CAT_COLORS.map((c) => (
            <option key={c} value={c}>
              {t(`addSighting.colors.${c}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>{t("addSighting.earTipped")}</label>
        <SegmentedControl
          name={t("addSighting.earTipped")}
          value={isEarTipped}
          options={triStateOptions}
          onChange={setIsEarTipped}
        />
      </div>

      <div className="field">
        <label>{t("addSighting.stray")}</label>
        <SegmentedControl
          name={t("addSighting.stray")}
          value={isStray}
          options={triStateOptions}
          onChange={setIsStray}
        />
      </div>

      <div className="row wizard-nav">
        <button className="btn btn-ghost btn-block" onClick={onClose} disabled={saving}>
          {t("common.cancel")}
        </button>
        <button className="btn btn-primary btn-block" onClick={onSubmit} disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </Modal>
  );
}
