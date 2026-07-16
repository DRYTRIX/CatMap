"""Server-rendered share pages with Open Graph tags for social crawlers."""

import html
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import Sighting

router = APIRouter(tags=["share"])
settings = get_settings()

_MAX_DESC = 200
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _site_base() -> str:
    return settings.public_site_url.rstrip("/")


def _share_description(sighting: Sighting) -> str:
    text = (sighting.description or "").strip()
    if sighting.status == "found":
        base = "This missing cat was reunited"
    elif sighting.kind == "missing":
        base = "Missing cat — can you help?"
    else:
        base = "A cat was spotted on CatMap"
    if not text:
        return base
    if len(text) > _MAX_DESC:
        text = text[: _MAX_DESC - 1] + "…"
    return f"{base}: {text}"


def _share_title(sighting: Sighting) -> str:
    if sighting.status == "found":
        return "Missing cat found on CatMap"
    if sighting.kind == "missing":
        return "Missing cat on CatMap — can you help?"
    return "Cat sighting on CatMap"


def _share_html(sighting: Sighting) -> str:
    site = _site_base()
    sighting_id = sighting.id
    title = _share_title(sighting)
    description = _share_description(sighting)
    share_url = f"{site}/s/{sighting_id}"
    app_url = f"/?s={sighting_id}"
    image_url = f"{site}/api/sightings/{sighting_id}/thumbnail"

    esc_title = html.escape(title)
    esc_desc = html.escape(description)
    esc_share = html.escape(share_url)
    esc_image = html.escape(image_url)
    esc_app = html.escape(app_url)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{esc_title}</title>
  <meta name="description" content="{esc_desc}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="CatMap" />
  <meta property="og:title" content="{esc_title}" />
  <meta property="og:description" content="{esc_desc}" />
  <meta property="og:url" content="{esc_share}" />
  <meta property="og:image" content="{esc_image}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{esc_title}" />
  <meta name="twitter:description" content="{esc_desc}" />
  <meta name="twitter:image" content="{esc_image}" />
  <meta http-equiv="refresh" content="0;url={esc_app}" />
  <link rel="canonical" href="{esc_share}" />
</head>
<body>
  <p><a href="{esc_app}">Open this cat sighting in CatMap</a></p>
</body>
</html>"""


@router.get("/s/{sighting_id}", response_class=HTMLResponse)
def share_page(sighting_id: str, db: Session = Depends(get_db)) -> HTMLResponse:
    """HTML share landing page with OG tags; redirects humans to the SPA."""
    if not _UUID_RE.match(sighting_id):
        raise HTTPException(status_code=404, detail="Sighting not found.")

    sighting = db.get(Sighting, sighting_id)
    if sighting is None or sighting.status not in ("active", "found"):
        raise HTTPException(status_code=404, detail="Sighting not found.")

    return HTMLResponse(content=_share_html(sighting))
