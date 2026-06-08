"""Image validation, EXIF GPS extraction, normalization and thumbnailing."""

import io

from PIL import ExifTags, Image, ImageOps

# Enable HEIC/HEIF decoding when pillow-heif is installed (optional dependency).
try:  # pragma: no cover - environment dependent
    import pillow_heif

    pillow_heif.register_heif_opener()
    _HEIC_SUPPORTED = True
except Exception:  # noqa: BLE001
    _HEIC_SUPPORTED = False

# Reverse lookup so we can resolve tag names to numeric IDs.
_GPS_IFD_TAG = next(
    (tag for tag, name in ExifTags.TAGS.items() if name == "GPSInfo"), None
)

# Formats we accept (Pillow format names). HEIF added only when supported.
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
if _HEIC_SUPPORTED:
    ALLOWED_FORMATS |= {"HEIF", "HEIC"}


class InvalidImageError(ValueError):
    """Raised when an upload is not a usable image."""


def _to_degrees(value) -> float:
    """Convert a Pillow GPS coordinate (3 rationals) to signed decimal degrees."""
    d, m, s = value
    return float(d) + float(m) / 60.0 + float(s) / 3600.0


def extract_gps(image_bytes: bytes) -> tuple[float, float] | None:
    """Return (lat, lng) from EXIF GPS data, or None when unavailable."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            exif = img.getexif()
            if not exif or _GPS_IFD_TAG is None:
                return None
            gps = exif.get_ifd(_GPS_IFD_TAG)
            if not gps:
                return None

            lat = gps.get(2)
            lat_ref = gps.get(1)
            lng = gps.get(4)
            lng_ref = gps.get(3)
            if not (lat and lat_ref and lng and lng_ref):
                return None

            lat_deg = _to_degrees(lat)
            lng_deg = _to_degrees(lng)
            if lat_ref in ("S", b"S"):
                lat_deg = -lat_deg
            if lng_ref in ("W", b"W"):
                lng_deg = -lng_deg

            if not (-90 <= lat_deg <= 90 and -180 <= lng_deg <= 180):
                return None
            return (lat_deg, lng_deg)
    except Exception:
        return None


def process_upload(
    image_bytes: bytes, max_edge: int, thumb_edge: int, max_pixels: int | None = None
) -> tuple[bytes, bytes, str]:
    """Validate, auto-orient, strip metadata, resize and thumbnail an upload.

    Returns (main_jpeg_bytes, thumbnail_jpeg_bytes, mime_type).
    Raises InvalidImageError for anything that is not a decodable, allowed image
    or that exceeds the pixel budget (decompression-bomb guard).
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as probe:
            fmt = probe.format
            width, height = probe.size
            probe.verify()  # cheap integrity check; consumes the image
    except Exception as exc:  # noqa: BLE001
        raise InvalidImageError("Uploaded file is not a valid image.") from exc

    if fmt not in ALLOWED_FORMATS:
        raise InvalidImageError(f"Unsupported image type: {fmt or 'unknown'}.")

    # Decompression-bomb guard: reject implausibly large pixel dimensions.
    if max_pixels and width * height > max_pixels:
        raise InvalidImageError("Image resolution is too large.")

    try:
        img = Image.open(io.BytesIO(image_bytes))
        # Apply EXIF orientation, then drop all metadata by re-encoding.
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise InvalidImageError("Could not decode the image.") from exc

    main = img.copy()
    main.thumbnail((max_edge, max_edge), Image.LANCZOS)
    main_buf = io.BytesIO()
    main.save(main_buf, format="JPEG", quality=85, optimize=True)

    thumb = img.copy()
    thumb.thumbnail((thumb_edge, thumb_edge), Image.LANCZOS)
    thumb_buf = io.BytesIO()
    thumb.save(thumb_buf, format="JPEG", quality=80, optimize=True)

    return main_buf.getvalue(), thumb_buf.getvalue(), "image/jpeg"
