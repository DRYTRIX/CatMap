"""Edit, mark-gone, report reasons, and staleness."""

from datetime import UTC, datetime, timedelta

import app.database as db
from app.models import Sighting
from tests.conftest import create_sighting


def _set_last_seen(sighting_id: str, when: datetime) -> None:
    with db.SessionLocal() as session:
        s = session.get(Sighting, sighting_id)
        s.last_seen_at = when
        session.commit()


def test_edit_description_and_location_creator_only(client):
    sid = create_sighting(client, "owner-001", description="old").json()["id"]

    forbidden = client.patch(
        f"/api/sightings/{sid}",
        headers={"X-Device-Token": "intruder"},
        data={"description": "hax"},
    )
    assert forbidden.status_code == 403

    ok = client.patch(
        f"/api/sightings/{sid}",
        headers={"X-Device-Token": "owner-001"},
        data={"description": "new desc", "lat": "10.5", "lng": "20.5"},
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["description"] == "new desc"
    assert body["lat"] == 10.5 and body["lng"] == 20.5


def test_edit_rejects_out_of_range_coords(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    res = client.patch(
        f"/api/sightings/{sid}",
        headers={"X-Device-Token": "owner-001"},
        data={"lat": "999", "lng": "0"},
    )
    assert res.status_code == 400


def test_mark_gone_removes_from_public_map(client):
    sid = create_sighting(client, "owner-001").json()["id"]

    assert (
        client.post(
            f"/api/sightings/{sid}/gone", headers={"X-Device-Token": "intruder"}
        ).status_code
        == 403
    )

    gone = client.post(f"/api/sightings/{sid}/gone", headers={"X-Device-Token": "owner-001"})
    assert gone.status_code == 200

    # Vanishes from public detail + dots.
    assert client.get(f"/api/sightings/{sid}").status_code == 404
    dots = client.get(
        "/api/sightings",
        params={"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180},
    ).json()
    assert dots == []


def test_report_reason_allowlist(client):
    sid = create_sighting(client, "owner-001").json()["id"]

    bad = client.post(
        f"/api/sightings/{sid}/report",
        headers={"X-Device-Token": "rep-0001"},
        data={"reason": "totally-made-up"},
    )
    assert bad.status_code == 400

    good = client.post(
        f"/api/sightings/{sid}/report",
        headers={"X-Device-Token": "rep-0002"},
        data={"reason": "wrong_location"},
    )
    assert good.status_code == 200
    assert good.json()["reported"] is True


def test_confirm_refreshes_last_seen_and_clears_stale(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    _set_last_seen(sid, datetime.now(UTC) - timedelta(days=60))

    # Stale before confirmation.
    assert client.get(f"/api/sightings/{sid}").json()["stale"] is True
    dots = client.get(
        "/api/sightings",
        params={"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180},
    ).json()
    assert dots[0]["stale"] is True

    # Confirming marks it freshly seen.
    client.post(f"/api/sightings/{sid}/confirm", headers={"X-Device-Token": "watcher-1"})
    assert client.get(f"/api/sightings/{sid}").json()["stale"] is False
