"""Edge cases for EXIF GPS extraction and orientation handling."""

import io

from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from app.images import extract_gps, process_upload


def _r(n, d=1):
    return IFDRational(n, d)


def _image_bytes(gps_ifd: dict | None = None, orientation: int | None = None, size=(640, 480)) -> bytes:
    img = Image.new("RGB", size, (200, 160, 90))
    buf = io.BytesIO()
    exif = Image.Exif()
    if gps_ifd is not None:
        exif[0x8825] = gps_ifd
    if orientation is not None:
        exif[0x0112] = orientation
    if gps_ifd is not None or orientation is not None:
        img.save(buf, format="JPEG", exif=exif)
    else:
        img.save(buf, format="JPEG")
    return buf.getvalue()


def test_extract_gps_no_exif():
    assert extract_gps(_image_bytes()) is None


def test_extract_gps_exif_without_gps_ifd():
    assert extract_gps(_image_bytes(orientation=1)) is None


def test_extract_gps_missing_required_fields():
    # Latitude only, no reference or longitude.
    gps = {2: (_r(48), _r(51), _r(3024, 100))}
    assert extract_gps(_image_bytes(gps)) is None


def test_extract_gps_north_east():
    gps = {
        1: "N", 2: (_r(48), _r(51), _r(3024, 100)),
        3: "E", 4: (_r(2), _r(17), _r(4020, 100)),
    }
    result = extract_gps(_image_bytes(gps))
    assert result is not None
    lat, lng = result
    assert 48 < lat < 49
    assert 2 < lng < 3


def test_extract_gps_south_west_negated():
    gps = {
        1: "S", 2: (_r(48), _r(51), _r(3024, 100)),
        3: "W", 4: (_r(2), _r(17), _r(4020, 100)),
    }
    result = extract_gps(_image_bytes(gps))
    assert result is not None
    lat, lng = result
    assert -49 < lat < -48
    assert -3 < lng < -2


def test_extract_gps_out_of_range_rejected():
    # 100 degrees latitude is outside the valid -90..90 range.
    gps = {
        1: "N", 2: (_r(100), _r(0), _r(0)),
        3: "E", 4: (_r(2), _r(17), _r(4020, 100)),
    }
    assert extract_gps(_image_bytes(gps)) is None


def test_extract_gps_garbage_bytes():
    assert extract_gps(b"not an image") is None


def test_process_upload_applies_exif_orientation():
    # Orientation 6 ("rotate 90 CW to display") on a landscape source should
    # produce a portrait output once exif_transpose runs.
    raw = _image_bytes(orientation=6, size=(640, 480))
    main, _thumb, _mime = process_upload(raw, 1600, 320, max_pixels=50_000_000)
    width, height = Image.open(io.BytesIO(main)).size
    assert width < height
