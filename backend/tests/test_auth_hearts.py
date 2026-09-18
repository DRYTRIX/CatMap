"""Auth, hearts, and cross-device identity tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from sqlalchemy import select

import app.database as db
from app.models import User, UserDevice, UserSession
from app.security import hash_token
from tests.conftest import create_sighting


def _signup(client, *, email="a@example.com", password="password123", token="device-a"):
    return client.post(
        "/api/auth/signup",
        data={"email": email, "password": password, "name": "Ada"},
        headers={"X-Device-Token": token},
    )


def test_signup_login_me_and_logout(client):
    res = _signup(client)
    assert res.status_code == 201
    body = res.json()
    assert body["session_token"]
    assert body["user"]["email"] == "a@example.com"
    assert body["user"]["device_claimed"] is True
    session = body["session_token"]

    me = client.get(
        "/api/auth/me",
        headers={"X-Device-Token": "device-a", "Authorization": f"Bearer {session}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "a@example.com"

    login = client.post(
        "/api/auth/login",
        data={"email": "a@example.com", "password": "password123"},
        headers={"X-Device-Token": "device-b"},
    )
    assert login.status_code == 200
    session_b = login.json()["session_token"]
    assert login.json()["user"]["device_claimed"] is True

    with db.SessionLocal() as session_db:
        devices = session_db.execute(select(UserDevice)).scalars().all()
        assert {d.device_token for d in devices} == {"device-a", "device-b"}

    out = client.post(
        "/api/auth/logout",
        headers={"X-Device-Token": "device-b", "Authorization": f"Bearer {session_b}"},
    )
    assert out.status_code == 200
    me2 = client.get(
        "/api/auth/me",
        headers={"X-Device-Token": "device-b", "Authorization": f"Bearer {session_b}"},
    )
    assert me2.status_code == 401


def test_cross_device_mine_visibility(client):
    create = create_sighting(client, "owner-device-a", description="fluffy")
    assert create.status_code == 201
    sighting_id = create.json()["id"]

    _signup(client, email="owner@example.com", token="owner-device-a")

    login = client.post(
        "/api/auth/login",
        data={"email": "owner@example.com", "password": "password123"},
        headers={"X-Device-Token": "owner-device-b"},
    )
    session_b = login.json()["session_token"]
    mine = client.get(
        "/api/sightings/mine",
        headers={"X-Device-Token": "owner-device-b", "Authorization": f"Bearer {session_b}"},
    )
    assert mine.status_code == 200
    ids = [s["id"] for s in mine.json()]
    assert sighting_id in ids
    assert mine.json()[0]["is_mine"] is True


def test_device_claimed_by_other_user(client):
    _signup(client, email="one@example.com", token="shared-device-1")
    res = _signup(client, email="two@example.com", token="shared-device-1")
    assert res.status_code == 201
    assert res.json()["user"]["device_claimed"] is False
    assert res.json()["user"]["device_claim_reason"] == "device_claimed_by_other"


def test_verify_and_reset_password(client):
    with patch("app.auth_service.send_verification_email") as send_v, patch(
        "app.auth_service.send_password_reset_email"
    ) as send_r, patch("app.auth_service.send_password_changed_email"):
        res = _signup(client, email="v@example.com")
        assert res.status_code == 201
        assert send_v.called
        raw_verify = send_v.call_args.kwargs["raw_token"]

        verified = client.post("/api/auth/verify-email", data={"token": raw_verify})
        assert verified.status_code == 200
        assert verified.json()["email_verified"] is True

        forgot = client.post(
            "/api/auth/password/forgot",
            data={"email": "v@example.com"},
            headers={"X-Device-Token": "device-a"},
        )
        assert forgot.status_code == 204
        raw_reset = send_r.call_args.kwargs["raw_token"]

        reset = client.post(
            "/api/auth/password/reset",
            data={"token": raw_reset, "password": "newpassword1"},
            headers={"X-Device-Token": "device-a"},
        )
        assert reset.status_code == 200

        bad = client.post(
            "/api/auth/login",
            data={"email": "v@example.com", "password": "password123"},
            headers={"X-Device-Token": "device-a"},
        )
        assert bad.status_code == 401

        good = client.post(
            "/api/auth/login",
            data={"email": "v@example.com", "password": "newpassword1"},
            headers={"X-Device-Token": "device-a"},
        )
        assert good.status_code == 200


def test_google_login_creates_user(client):
    claims = {
        "sub": "google-sub-1",
        "email": "g@example.com",
        "email_verified": True,
        "name": "G User",
    }
    with patch("app.auth_service.verify_google_id_token", return_value=claims):
        res = client.post(
            "/api/auth/google",
            data={"id_token": "fake"},
            headers={"X-Device-Token": "g-device"},
        )
    assert res.status_code == 200
    assert res.json()["user"]["email"] == "g@example.com"
    assert "google" in res.json()["user"]["providers"]
    assert res.json()["user"]["email_verified"] is True


def test_session_expiry(client):
    res = _signup(client, email="exp@example.com")
    session = res.json()["session_token"]
    with db.SessionLocal() as session_db:
        row = session_db.execute(
            select(UserSession).where(UserSession.token_hash == hash_token(session))
        ).scalar_one()
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session_db.commit()

    me = client.get(
        "/api/auth/me",
        headers={"X-Device-Token": "device-a", "Authorization": f"Bearer {session}"},
    )
    assert me.status_code == 401


def test_hearts_toggle_and_import(client):
    created = create_sighting(client, "heart-dev-1")
    sid = created.json()["id"]

    add = client.post(
        "/api/hearts",
        data={"target_type": "sighting", "target_id": sid},
        headers={"X-Device-Token": "heart-dev-1"},
    )
    assert add.status_code == 201
    assert add.json()["hearted"] is True
    assert add.json()["hearts_count"] == 1

    detail = client.get(f"/api/sightings/{sid}", headers={"X-Device-Token": "heart-dev-1"})
    assert detail.json()["hearted"] is True
    assert detail.json()["hearts_count"] == 1

    add2 = client.post(
        "/api/hearts",
        data={"target_type": "sighting", "target_id": sid},
        headers={"X-Device-Token": "heart-dev-2"},
    )
    assert add2.json()["hearts_count"] == 2

    signup = _signup(client, email="heart@example.com", token="heart-dev-1")
    session = signup.json()["session_token"]
    login = client.post(
        "/api/auth/login",
        data={"email": "heart@example.com", "password": "password123"},
        headers={"X-Device-Token": "heart-dev-2"},
    )
    assert login.json()["user"]["device_claimed"] is True

    listed = client.get(
        "/api/hearts",
        headers={
            "X-Device-Token": "heart-dev-2",
            "Authorization": f"Bearer {login.json()['session_token']}",
        },
    )
    assert listed.status_code == 200
    assert any(h["target_id"] == sid for h in listed.json())

    imp = client.post(
        "/api/hearts/import",
        data={"sighting_ids": sid},
        headers={"X-Device-Token": "heart-dev-1", "Authorization": f"Bearer {session}"},
    )
    assert imp.status_code == 200
    assert imp.json()["skipped"] >= 1


def test_unsubscribe(client):
    _signup(client, email="unsub@example.com")
    with db.SessionLocal() as session_db:
        user = session_db.execute(
            select(User).where(User.email == "unsub@example.com")
        ).scalar_one()
        token = user.unsubscribe_token

    page = client.get(f"/api/auth/email/unsubscribe?token={token}&category=activity")
    assert page.status_code == 200
    assert b"Unsubscribed" in page.content
    with db.SessionLocal() as session_db:
        user = session_db.execute(
            select(User).where(User.email == "unsub@example.com")
        ).scalar_one()
        assert user.email_activity is False
