"""Missing-cat posts: kind field and mark-as-found lifecycle."""

from tests.conftest import create_sighting


def test_create_defaults_to_sighting_kind(client):
    body = create_sighting(client, "owner-001").json()
    assert body["kind"] == "sighting"
    assert body["status"] == "active"

    detail = client.get(f"/api/sightings/{body['id']}").json()
    assert detail["kind"] == "sighting"
    assert detail["status"] == "active"


def test_create_missing_kind(client):
    body = create_sighting(client, "owner-001", kind="missing").json()
    assert body["kind"] == "missing"
    assert body["status"] == "active"

    dots = client.get(
        "/api/sightings",
        params={"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180},
    ).json()
    assert len(dots) == 1
    assert dots[0]["kind"] == "missing"


def test_create_rejects_invalid_kind(client):
    res = create_sighting(client, "owner-001", kind="lost")
    assert res.status_code == 400


def test_kind_filter_on_list_and_clusters(client):
    create_sighting(client, "owner-001", kind="sighting", lat=40.0, lng=-3.0)
    create_sighting(client, "owner-002", kind="missing", lat=40.1, lng=-3.1)

    sightings = client.get(
        "/api/sightings",
        params={
            "min_lat": -90,
            "max_lat": 90,
            "min_lng": -180,
            "max_lng": 180,
            "kind": "sighting",
        },
    ).json()
    assert len(sightings) == 1
    assert sightings[0]["kind"] == "sighting"

    missing = client.get(
        "/api/sightings",
        params={
            "min_lat": -90,
            "max_lat": 90,
            "min_lng": -180,
            "max_lng": 180,
            "kind": "missing",
        },
    ).json()
    assert len(missing) == 1
    assert missing[0]["kind"] == "missing"

    clusters = client.get(
        "/api/sightings/clusters",
        params={
            "min_lat": -90,
            "max_lat": 90,
            "min_lng": -180,
            "max_lng": 180,
            "zoom": 5,
            "kind": "missing",
        },
    ).json()
    assert sum(c["count"] for c in clusters) == 1


def test_mark_found_creator_only_removes_from_map_keeps_in_mine(client):
    sid = create_sighting(client, "owner-001", kind="missing").json()["id"]

    assert (
        client.post(
            f"/api/sightings/{sid}/found", headers={"X-Device-Token": "intruder"}
        ).status_code
        == 403
    )

    found = client.post(
        f"/api/sightings/{sid}/found", headers={"X-Device-Token": "owner-001"}
    )
    assert found.status_code == 200
    assert found.json()["status"] == "found"
    assert found.json()["kind"] == "missing"

    # Off the public map.
    dots = client.get(
        "/api/sightings",
        params={"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180},
    ).json()
    assert dots == []

    # Still viewable by id (My sightings / deep link).
    detail = client.get(f"/api/sightings/{sid}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "found"
    assert client.get(f"/api/sightings/{sid}/thumbnail").status_code == 200

    mine = client.get("/api/sightings/mine", headers={"X-Device-Token": "owner-001"}).json()
    assert len(mine) == 1
    assert mine[0]["id"] == sid
    assert mine[0]["status"] == "found"


def test_mark_found_rejects_regular_sighting(client):
    sid = create_sighting(client, "owner-001", kind="sighting").json()["id"]
    res = client.post(
        f"/api/sightings/{sid}/found", headers={"X-Device-Token": "owner-001"}
    )
    assert res.status_code == 400


def test_mark_found_records_outcome_and_story(client):
    sid = create_sighting(client, "owner-out", kind="missing").json()["id"]
    bad = client.post(
        f"/api/sightings/{sid}/found",
        headers={"X-Device-Token": "owner-out"},
        data={"outcome": "abducted"},
    )
    assert bad.status_code == 400

    res = client.post(
        f"/api/sightings/{sid}/found",
        headers={"X-Device-Token": "owner-out"},
        data={"outcome": "found_by_others", "story": "  A neighbour spotted her.  "},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["found_outcome"] == "found_by_others"
    assert body["found_story"] == "A neighbour spotted her."
    assert body["resolved_at"] is not None


def test_mark_found_defaults_to_returned_home(client):
    sid = create_sighting(client, "owner-def", kind="missing").json()["id"]
    res = client.post(f"/api/sightings/{sid}/found", headers={"X-Device-Token": "owner-def"})
    assert res.json()["found_outcome"] == "returned_home"


def test_relist_gone_and_found(client):
    owner = {"X-Device-Token": "owner-rel"}
    sid = create_sighting(client, "owner-rel", kind="missing").json()["id"]

    # Active posts can't be relisted; strangers can't relist.
    assert client.post(f"/api/sightings/{sid}/relist", headers=owner).status_code == 400
    client.post(f"/api/sightings/{sid}/found", headers=owner, data={"outcome": "deceased"})
    assert (
        client.post(
            f"/api/sightings/{sid}/relist", headers={"X-Device-Token": "stranger"}
        ).status_code
        == 403
    )

    res = client.post(f"/api/sightings/{sid}/relist", headers=owner)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "active"
    assert body["found_outcome"] is None and body["resolved_at"] is None

    dots = client.get(
        "/api/sightings",
        params={"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180},
    ).json()
    assert [d["id"] for d in dots] == [sid]

    # A gone sighting can be relisted too.
    sid2 = create_sighting(client, "owner-rel").json()["id"]
    client.post(f"/api/sightings/{sid2}/gone", headers=owner)
    assert client.post(f"/api/sightings/{sid2}/relist", headers=owner).json()["status"] == "active"


def test_missing_reminders_sent_once_per_window(client):
    from datetime import UTC, datetime, timedelta

    import app.database as db
    from app.models import Sighting
    from app.user_notifications import send_missing_reminders

    old = create_sighting(client, "owner-rem", kind="missing", cat_name="Miso").json()["id"]
    fresh = create_sighting(client, "owner-rem", kind="missing").json()["id"]
    regular = create_sighting(client, "owner-rem").json()["id"]

    session = db.SessionLocal()
    long_ago = datetime.now(UTC) - timedelta(days=40)
    for sid in (old, regular):
        row = session.get(Sighting, sid)
        row.created_at = long_ago
        row.last_seen_at = long_ago
    session.commit()
    session.close()

    assert send_missing_reminders() == 1  # only the old missing post
    assert send_missing_reminders() == 0  # throttled

    notes = client.get("/api/notifications", headers={"X-Device-Token": "owner-rem"}).json()
    reminders = [n for n in notes if n["type"] == "missing_reminder"]
    assert len(reminders) == 1 and reminders[0]["sighting_id"] == old
    assert fresh not in [n["sighting_id"] for n in reminders]


def test_admin_can_trigger_reminders(client):
    ok = client.post("/api/admin/jobs/missing-reminders", headers={"X-Admin-Token": "test-admin"})
    assert ok.status_code == 200 and ok.json() == {"sent": 0}
    assert client.post("/api/admin/jobs/missing-reminders").status_code in (401, 403)


def test_recent_can_exclude_deceased_outcome(client):
    happy = create_sighting(client, "owner-happy", kind="missing").json()["id"]
    sad = create_sighting(client, "owner-sad1", kind="missing").json()["id"]
    client.post(f"/api/sightings/{happy}/found", headers={"X-Device-Token": "owner-happy"})
    client.post(
        f"/api/sightings/{sad}/found",
        headers={"X-Device-Token": "owner-sad1"},
        data={"outcome": "deceased"},
    )
    res = client.get(
        "/api/sightings/recent",
        params={"status": "found", "kind": "missing", "exclude_outcome": "deceased"},
    ).json()
    assert [r["id"] for r in res] == [happy]
