"""Ownership, pending My cats, watches, private tips, alert prefs."""

from tests.conftest import create_sighting


def test_get_sighting_is_mine(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    mine = client.get(
        f"/api/sightings/{sid}", headers={"X-Device-Token": "owner-001"}
    ).json()
    assert mine["is_mine"] is True
    other = client.get(
        f"/api/sightings/{sid}", headers={"X-Device-Token": "other-001"}
    ).json()
    assert other["is_mine"] is False


def test_mine_includes_pending(client):
    sid = create_sighting(client, "owner-pend").json()["id"]
    from app.database import SessionLocal
    from app.models import Sighting

    db = SessionLocal()
    try:
        s = db.get(Sighting, sid)
        s.status = "pending"
        db.commit()
    finally:
        db.close()

    mine = client.get(
        "/api/sightings/mine", headers={"X-Device-Token": "owner-pend"}
    ).json()
    assert any(row["id"] == sid and row["status"] == "pending" for row in mine)

    detail = client.get(
        f"/api/sightings/{sid}", headers={"X-Device-Token": "owner-pend"}
    )
    assert detail.status_code == 200
    assert detail.json()["status"] == "pending"

    # strangers still 404 pending
    assert (
        client.get(
            f"/api/sightings/{sid}", headers={"X-Device-Token": "stranger1"}
        ).status_code
        == 404
    )


def test_contact_hidden_unless_public(client):
    res = create_sighting(
        client, "ownerpriv", kind="missing", contact="secret@x.test"
    )
    assert res.status_code == 201
    sid = res.json()["id"]

    public = client.get(f"/api/sightings/{sid}").json()
    assert public.get("contact") in (None, "")
    assert public.get("contact_public") is False

    owner = client.get(
        f"/api/sightings/{sid}", headers={"X-Device-Token": "ownerpriv"}
    ).json()
    assert owner["contact"] == "secret@x.test"
    assert owner["is_mine"] is True


def test_private_tip(client):
    sid = create_sighting(client, "ownertip1", kind="missing").json()["id"]

    res = client.post(
        f"/api/sightings/{sid}/message",
        headers={"X-Device-Token": "finder01"},
        data={"text": "Saw orange cat near the park"},
    )
    assert res.status_code == 200
    assert res.json()["sent"] is True

    inbox = client.get(
        "/api/notifications", headers={"X-Device-Token": "ownertip1"}
    ).json()
    assert any(n["type"] == "private_tip" for n in inbox)


def test_watch_sighting(client):
    sid = create_sighting(client, "ownerwatch").json()["id"]
    res = client.post(
        "/api/watches",
        headers={"X-Device-Token": "watcher1"},
        data={"target_type": "sighting", "target_id": sid},
    )
    assert res.status_code == 201
    assert res.json()["watching"] is True

    detail = client.get(
        f"/api/sightings/{sid}", headers={"X-Device-Token": "watcher1"}
    ).json()
    assert detail["watching"] is True

    gone = client.delete(
        f"/api/watches?target_type=sighting&target_id={sid}",
        headers={"X-Device-Token": "watcher1"},
    )
    assert gone.json()["watching"] is False


def test_push_alert_prefs_empty(client):
    res = client.get("/api/push/alerts", headers={"X-Device-Token": "prefs001"})
    assert res.status_code == 200
    assert res.json()["has_subscription"] is False
