import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera } from "@fortawesome/free-solid-svg-icons";
import { fileInputAccept } from "../lib/photoGps";
import {
  pickNativePhotoFromCamera,
  pickNativePhotosFromGallery,
  useNativePhotoPicker,
} from "../lib/pickPhotos";

/**
 * "Take or choose a photo" control. Uses Capacitor Camera on native Android/iOS
 * (separate gallery + camera-capture buttons, since the plugin's metadata-aware
 * APIs no longer offer a combined OS prompt); falls back to `<input type="file">`
 * on web.
 */
export default function PhotoPickButton({
  label,
  disabled = false,
  multiple = false,
  limit = 1,
  onFiles,
  onError,
  className = "btn btn-ghost btn-block",
  style,
}) {
  const { t } = useTranslation();
  const native = useNativePhotoPicker();
  const fileRef = useRef(null);
  const [picking, setPicking] = useState(false);

  async function runPick(pickFn) {
    if (disabled || picking) return;
    setPicking(true);
    try {
      const files = await pickFn();
      if (files.length) onFiles(files);
    } catch (err) {
      onError?.(err);
    } finally {
      setPicking(false);
    }
  }

  const busy = disabled || picking;
  const text = picking ? t("photoPick.opening") : label;

  if (native) {
    return (
      <div className="row" style={style}>
        <button
          type="button"
          className={className}
          style={{ flex: 1 }}
          disabled={busy}
          onClick={() => runPick(() => pickNativePhotosFromGallery(limit))}
        >
          {text}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t("photoPick.camera")}
          disabled={busy}
          onClick={() => runPick(pickNativePhotoFromCamera)}
        >
          <FontAwesomeIcon icon={faCamera} />
        </button>
      </div>
    );
  }

  return (
    <label className={className} style={style}>
      {label}
      <input
        ref={fileRef}
        type="file"
        accept={fileInputAccept()}
        multiple={multiple}
        style={{ display: "none" }}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
