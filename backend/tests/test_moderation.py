from datetime import UTC, datetime

from tests.conftest import create_sighting

ADMIN = {"X-Admin-Token": "test-admin"}


def test_report_auto_hides_at_threshold(client):
    sid = create_sighting(client, "owner-001").json()["id"]

    # Default AUTO_HIDE_THRESHOLD is 3 distinct reports.
    r1 = client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0001"})
    assert r1.json() == {"reported": True, "hidden": False}
    client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0002"})
    r3 = client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0003"})
    assert r3.json()["hidden"] is True

    # Hidden sightings disappear from public list + detail.
    assert client.get(f"/api/sightings/{sid}").status_code == 404
    dots = client.get(
        "/api/sightings",
        params={"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180},
    ).json()
    assert dots == []


def test_report_idempotent_per_device(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    first = client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0001"})
    second = client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0001"})
    assert first.json()["reported"] is True
    assert second.json()["reported"] is False


def test_delete_requires_creator(client):
    sid = create_sighting(client, "owner-001").json()["id"]

    forbidden = client.request(
        "DELETE", f"/api/sightings/{sid}", headers={"X-Device-Token": "intruder-1"}
    )
    assert forbidden.status_code == 403

    ok = client.request(
        "DELETE", f"/api/sightings/{sid}", headers={"X-Device-Token": "owner-001"}
    )
    assert ok.status_code == 204
    assert client.get(f"/api/sightings/{sid}").status_code == 404


def test_admin_requires_token(client):
    create_sighting(client, "owner-001")
    assert client.get("/api/admin/reports").status_code == 401
    assert client.get(
        "/api/admin/reports", headers={"X-Admin-Token": "wrong"}
    ).status_code == 401


def test_admin_can_list_and_hide(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0001"})

    reports = client.get("/api/admin/reports", headers=ADMIN)
    assert reports.status_code == 200
    assert reports.json()[0]["id"] == sid

    hide = client.post(f"/api/admin/sightings/{sid}/hide", headers=ADMIN)
    assert hide.json()["status"] == "hidden"
    assert client.get(f"/api/sightings/{sid}").status_code == 404

    unhide = client.post(f"/api/admin/sightings/{sid}/unhide", headers=ADMIN)
    assert unhide.json()["status"] == "active"
    assert client.get(f"/api/sightings/{sid}").status_code == 200


def test_admin_actions_audit_log(client):
    sid = create_sighting(client, "owner-001").json()["id"]

    client.post(f"/api/admin/sightings/{sid}/hide", headers=ADMIN)
    client.post(f"/api/admin/sightings/{sid}/unhide", headers=ADMIN)
    client.delete(f"/api/admin/sightings/{sid}", headers=ADMIN)

    assert client.get("/api/admin/actions").status_code == 401

    actions = client.get("/api/admin/actions", headers=ADMIN)
    assert actions.status_code == 200
    rows = actions.json()
    assert [r["action"] for r in rows[:3]] == ["delete", "unhide", "hide"]
    assert all(r["sighting_id"] == sid for r in rows[:3])


def test_admin_reports_thumbnail_url_points_at_admin_route(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0001"})
    row = client.get("/api/admin/reports", headers=ADMIN).json()[0]
    assert row["thumbnail_url"] == f"/api/admin/sightings/{sid}/thumbnail"


def test_admin_images_served_even_when_hidden(client):
    """The public image routes 404 on hidden rows; admin routes must not."""
    sid = create_sighting(client, "owner-001").json()["id"]
    client.post(f"/api/admin/sightings/{sid}/hide", headers=ADMIN)

    # Public routes 404 once hidden.
    assert client.get(f"/api/sightings/{sid}/thumbnail").status_code == 404

    # Admin routes still serve the bytes.
    thumb = client.get(f"/api/admin/sightings/{sid}/thumbnail", headers=ADMIN)
    assert thumb.status_code == 200
    assert thumb.headers["content-type"] == "image/jpeg"
    assert len(thumb.content) > 0

    photo = client.get(f"/api/admin/sightings/{sid}/photo", headers=ADMIN)
    assert photo.status_code == 200
    assert len(photo.content) > 0


def test_admin_images_require_token(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    assert client.get(f"/api/admin/sightings/{sid}/thumbnail").status_code == 401


def test_admin_metrics_requires_token(client):
    assert client.get("/api/admin/metrics").status_code == 401
    assert client.get(
        "/api/admin/metrics", headers={"X-Admin-Token": "wrong"}
    ).status_code == 401


def test_admin_metrics_counts(client):
    active_id = create_sighting(client, "owner-001").json()["id"]
    hidden_id = create_sighting(client, "owner-002").json()["id"]
    client.post(f"/api/admin/sightings/{hidden_id}/hide", headers=ADMIN)

    client.post(
        f"/api/sightings/{active_id}/confirm", headers={"X-Device-Token": "conf-0001"}
    )
    client.post(
        f"/api/sightings/{active_id}/report", headers={"X-Device-Token": "rep-0001"}
    )

    metrics = client.get("/api/admin/metrics", headers=ADMIN)
    assert metrics.status_code == 200
    body = metrics.json()

    assert body["total_sightings"] == 2
    assert body["active_sightings"] == 1
    assert body["hidden_sightings"] == 1
    assert body["reported_sightings"] == 1
    assert body["total_reports"] == 1
    assert body["total_confirmations"] == 1
    assert body["actions_last_7d"] == {"hide": 1}

    days = body["new_sightings_by_day"]
    assert len(days) == 14
    assert sum(d["count"] for d in days) == 2
    assert days[-1]["date"] == datetime.now(UTC).date().isoformat()
    assert [d["date"] for d in days] == sorted(d["date"] for d in days)
