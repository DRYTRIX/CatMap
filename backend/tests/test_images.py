import io

import pytest
from PIL import Image

from app.images import InvalidImageError, process_upload


def _img(fmt="JPEG", size=(320, 240)):
    buf = io.BytesIO()
    Image.new("RGB", size, (120, 120, 120)).save(buf, format=fmt)
    return buf.getvalue()


def test_process_upload_happy_path():
    main, thumb, mime = process_upload(_img(), 1600, 320, max_pixels=50_000_000)
    assert mime == "image/jpeg"
    assert max(Image.open(io.BytesIO(thumb)).size) <= 320
    assert len(main) > 0


def test_decompression_bomb_rejected():
    # A perfectly valid small image, but the pixel budget is tiny.
    with pytest.raises(InvalidImageError):
        process_upload(_img(size=(320, 240)), 1600, 320, max_pixels=10)


def test_unsupported_format_rejected():
    with pytest.raises(InvalidImageError):
        process_upload(_img(fmt="GIF"), 1600, 320, max_pixels=50_000_000)


def test_garbage_rejected():
    with pytest.raises(InvalidImageError):
        process_upload(b"not an image", 1600, 320)
