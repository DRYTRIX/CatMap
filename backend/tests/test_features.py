"""Tests for comments, notifications inbox, and device blocklist."""

from tests.conftest import create_sighting


def test_create_and_list_comments(client):
    r = create_sighting(client, "owner-token", kind="missing", cat_name="Whiskers")
    sid = r.json()["id"]

    listed = client.get(f"/api/sightings/{sid}/comments")
    assert listed.status_code == 200
    assert listed.json() == []

    created = client.post(
        f"/api/sightings/{sid}/comments",
        headers={"X-Device-Token": "helper-token"},
        data={"text": "Saw near the park"},
    )
    assert created.status_code == 201
    assert created.json()["text"] == "Saw near the park"

    listed2 = client.get(f"/api/sightings/{sid}/comments")
    assert len(listed2.json()) == 1


def test_blocklist_blocks_mutations(client):
    token = "blocked-user-01"
    admin = {"X-Admin-Token": "test-admin"}
    client.post(
        "/api/admin/blocked-tokens",
        headers=admin,
        data={"token": token, "reason": "spam"},
    )

    r = client.post(
        "/api/sightings",
        headers={"X-Device-Token": token},
        files={"image": ("cat.jpg", b"not-used", "image/jpeg")},
        data={"lat": "1", "lng": "1", "description": "nope"},
    )
    assert r.status_code == 403


def test_notifications_unread_count(client):
    owner = "notif-owner"
    helper = "notif-helper"
    sid = create_sighting(client, owner).json()["id"]
    client.post(
        f"/api/sightings/{sid}/confirm",
        headers={"X-Device-Token": helper},
    )

    unread = client.get(
        "/api/notifications/unread-count",
        headers={"X-Device-Token": owner},
    )
    assert unread.status_code == 200
    assert unread.json()["count"] >= 1

    client.post(
        "/api/notifications/read",
        headers={"X-Device-Token": owner},
        data={},
    )
    unread2 = client.get(
        "/api/notifications/unread-count",
        headers={"X-Device-Token": owner},
    )
    assert unread2.json()["count"] == 0


def test_missing_cat_fields(client):
    r = create_sighting(
        client,
        "missing-owner",
        kind="missing",
        cat_name="Luna",
        contact="555-0100",
    )
    assert r.status_code == 201
    body = r.json()
    assert body["cat_name"] == "Luna"
    assert body["contact"] == "555-0100"
