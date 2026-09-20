"""Area watches: nearby alerts without push, plus the weekly digest."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import app.database as db
from app.models import User
from tests.conftest import create_sighting

WATCHER = "watcher-0001"


def _h(token):
    return {"X-Device-Token": token}


def _area(client, token=WATCHER, **kw):
    data = {"lat": "40.0", "lng": "-3.0", "radius_km": "5", "label": "Home", **kw}
    return client.post("/api/watches/areas", headers=_h(token), data=data)


def test_create_list_delete_area_watch(client):
    res = _area(client)
    assert res.status_code == 201
    body = res.json()
    assert body["target_type"] == "area" and body["label"] == "Home" and body["radius_km"] == 5

    listed = client.get("/api/watches", headers=_h(WATCHER)).json()
    assert [w["id"] for w in listed] == [body["id"]]

    gone = client.delete(
        "/api/watches",
        headers=_h(WATCHER),
        params={"target_type": "area", "target_id": body["target_id"]},
    )
    assert gone.status_code == 200
    assert client.get("/api/watches", headers=_h(WATCHER)).json() == []


def test_area_watch_validation_and_cap(client):
    assert _area(client, radius_km="0.1").status_code == 400
    assert _area(client, radius_km="500").status_code == 400
    assert _area(client, lat="95").status_code == 400
    for _ in range(5):
        assert _area(client).status_code == 201
    assert _area(client).status_code == 400  # cap reached


def test_nearby_sighting_alerts_area_watcher_once(client):
    _area(client)  # radius 5km around (40, -3)
    _area(client, label="Also home")  # overlapping second watch, same device
    _area(client, token="far-away-01", lat="10", lng="10")

    create_sighting(client, "poster-0001", lat=40.01, lng=-3.01, description="tabby")

    notes = client.get("/api/notifications", headers=_h(WATCHER)).json()
    assert [n["type"] for n in notes] == ["sighting_nearby"]  # one, not two
    assert client.get("/api/notifications", headers=_h("far-away-01")).json() == []


def test_poster_not_alerted_by_own_sighting(client):
    _area(client, token="poster-0002")
    create_sighting(client, "poster-0002", lat=40.0, lng=-3.0)
    assert client.get("/api/notifications", headers=_h("poster-0002")).json() == []


def _verified_user(client, token, email):
    client.post(
        "/api/auth/signup",
        data={"email": email, "password": "password123", "name": "Ada"},
        headers=_h(token),
    )
    session = db.SessionLocal()
    user = session.query(User).filter_by(email=email).one()
    user.email_verified_at = datetime.now(UTC)
    session.commit()
    session.close()


def test_weekly_digest(client):
    from app.user_notifications import send_weekly_digest

    _verified_user(client, WATCHER, "digest@example.com")
    _area(client)
    create_sighting(client, "poster-0003", lat=40.01, lng=-3.0, description="ginger cat")
    create_sighting(client, "poster-0004", lat=41.5, lng=-3.0, description="too far")

    # Opt-in required.
    with patch("app.user_notifications.send_notification_email", return_value=True) as mail:
        assert send_weekly_digest() == 0
        mail.assert_not_called()

        session = db.SessionLocal()
        session.query(User).filter_by(email="digest@example.com").one().email_digest = True
        session.commit()
        session.close()

        assert send_weekly_digest() == 1
        kwargs = mail.call_args.kwargs
        assert kwargs["to"] == "digest@example.com" and kwargs["category"] == "digest"
        assert "Home: 1 new" in kwargs["body"] and "ginger cat" in kwargs["body"]
        assert "too far" not in kwargs["body"]

        # Throttled: a second run the same day sends nothing.
        assert send_weekly_digest() == 0
        # ...but a week later, with nothing new in the window, there's also nothing to send.
        assert send_weekly_digest(now=datetime.now(UTC) + timedelta(days=8)) == 0


def test_digest_pref_and_unsubscribe(client):
    _verified_user(client, "prefs-dev-01", "prefs@example.com")
    login = client.post(
        "/api/auth/login",
        data={"email": "prefs@example.com", "password": "password123"},
        headers=_h("prefs-dev-01"),
    ).json()
    auth = {**_h("prefs-dev-01"), "Authorization": f"Bearer {login['session_token']}"}
    assert client.patch("/api/auth/email-prefs", headers=auth, data={"digest": "true"}).json()["digest"] is True

    session = db.SessionLocal()
    token = session.query(User).filter_by(email="prefs@example.com").one().unsubscribe_token
    session.close()
    res = client.get("/api/auth/email/unsubscribe", params={"token": token, "category": "digest"})
    assert res.status_code == 200
    me = client.patch("/api/auth/email-prefs", headers=auth, data={}).json()
    assert me["digest"] is False


def test_admin_can_trigger_digest(client):
    ok = client.post("/api/admin/jobs/weekly-digest", headers={"X-Admin-Token": "test-admin"})
    assert ok.status_code == 200 and ok.json() == {"sent": 0}
