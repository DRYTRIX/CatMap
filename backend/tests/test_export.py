"""Public GeoJSON/CSV export and the fuller account export."""

import csv
import io

from tests.conftest import create_sighting

WORLD = {"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180}


def test_export_geojson(client):
    create_sighting(
        client, "device-aaaa", lat=41.0, lng=2.0, description="tabby",
        kind="missing", cat_name="Miso", contact="secret@example.com",
    )
    res = client.get("/api/sightings/export", params=WORLD)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/geo+json")
    assert "attachment" in res.headers["content-disposition"]
    body = res.json()
    assert body["type"] == "FeatureCollection" and len(body["features"]) == 1
    feat = body["features"][0]
    assert feat["geometry"] == {"type": "Point", "coordinates": [2.0, 41.0]}
    assert feat["properties"]["description"] == "tabby"
    # No private fields leak.
    assert "secret@example.com" not in res.text
    assert "device-aaaa" not in res.text


def test_export_csv_and_formula_injection(client):
    create_sighting(client, "device-aaaa", description="=HYPERLINK(1)")
    res = client.get("/api/sightings/export", params={**WORLD, "format": "csv"})
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(res.text)))
    assert len(rows) == 1
    assert rows[0]["description"] == "'=HYPERLINK(1)"


def test_export_respects_bbox_filters_and_validation(client):
    create_sighting(client, "device-aaaa", lat=10, lng=10)
    create_sighting(client, "device-bbbb", lat=50, lng=50, kind="missing")
    box = {"min_lat": 0, "max_lat": 20, "min_lng": 0, "max_lng": 20}
    assert len(client.get("/api/sightings/export", params=box).json()["features"]) == 1
    only_missing = client.get("/api/sightings/export", params={**WORLD, "kind": "missing"})
    assert len(only_missing.json()["features"]) == 1
    assert client.get("/api/sightings/export", params={**WORLD, "format": "xml"}).status_code == 422
    bad = {**WORLD, "min_lat": 5, "max_lat": 1}
    assert client.get("/api/sightings/export", params=bad).status_code == 400


def test_account_export_includes_activity(client):
    other = create_sighting(client, "someone-else1", description="other").json()["id"]
    mine = create_sighting(client, "export-dev-01", description="mine").json()["id"]
    client.post(f"/api/sightings/{other}/confirm", headers={"X-Device-Token": "export-dev-01"})
    client.post(
        "/api/watches",
        headers={"X-Device-Token": "export-dev-01"},
        data={"target_type": "sighting", "target_id": other},
    )
    signup = client.post(
        "/api/auth/signup",
        data={"email": "exp@example.com", "password": "password123", "name": "Ada"},
        headers={"X-Device-Token": "export-dev-01"},
    )
    session = signup.json()["session_token"]
    res = client.get(
        "/api/auth/export",
        headers={"X-Device-Token": "export-dev-01", "Authorization": f"Bearer {session}"},
    )
    assert res.status_code == 200
    data = res.json()
    s = next(x for x in data["sightings"] if x["id"] == mine)
    assert s["photo_count"] >= 1 and "last_seen_at" in s
    assert [c["sighting_id"] for c in data["confirmations"]] == [other]
    assert [(w["target_type"], w["target_id"]) for w in data["watches"]] == [("sighting", other)]
