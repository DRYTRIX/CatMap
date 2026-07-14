import { useRef, useState } from "react";
import { fileInputAccept } from "../lib/photoGps";
import { pickNativePhotos, useNativePhotoPicker } from "../lib/pickPhotos";

/**
 * "Take or choose a photo" control. Uses Capacitor Camera on native Android/iOS
 * (camera + gallery chooser); falls back to `<input type="file">` on web.
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
  const native = useNativePhotoPicker();
  const fileRef = useRef(null);
  const [picking, setPicking] = useState(false);

  async function handleNativePick() {
    if (disabled || picking) return;
    setPicking(true);
    try {
      const files = await pickNativePhotos();
      if (files.length) onFiles(files);
    } catch (err) {
      onError?.(err);
    } finally {
      setPicking(false);
    }
  }

  const busy = disabled || picking;
  const text = picking ? "Opening…" : label;

  if (native) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        disabled={busy}
        onClick={handleNativePick}
      >
        {text}
      </button>
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
