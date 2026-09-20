"""Moderation upgrades: action context, cat reports, admin cats, merge, bulk."""

from tests.conftest import create_sighting

ADMIN = {"X-Admin-Token": "test-admin"}
OWNER = "owner-mod-01"


def _h(token):
    return {"X-Device-Token": token}


def _cat(client, token, name):
    sid = create_sighting(client, token).json()["id"]
    cid = client.post(
        "/api/cats", headers=_h(token), data={"sighting_ids": sid, "name": name}
    ).json()["id"]
    return cid, sid


def test_actions_record_reason_and_label(client):
    sid = create_sighting(client, OWNER).json()["id"]
    res = client.post(
        f"/api/admin/sightings/{sid}/hide",
        params={"reason": "not a cat"},
        headers={**ADMIN, "X-Admin-Label": "  alice  "},
    )
    assert res.status_code == 200
    client.post(f"/api/admin/sightings/{sid}/unhide", headers=ADMIN)

    actions = client.get("/api/admin/actions", headers=ADMIN).json()
    by_action = {a["action"]: a for a in actions}
    assert by_action["hide"]["reason"] == "not a cat"
    assert by_action["hide"]["admin_label"] == "alice"
    assert by_action["unhide"]["reason"] is None and by_action["unhide"]["admin_label"] is None

    too_long = client.post(
        f"/api/admin/sightings/{sid}/hide", params={"reason": "x" * 281}, headers=ADMIN
    )
    assert too_long.status_code == 422


def test_cat_report_once_per_device_and_listed(client):
    cat, _ = _cat(client, OWNER, "Miso")
    assert client.post(f"/api/cats/{cat}/report", headers=_h("reporter-01"), data={"reason": "spam"}).json()["reported"] is True
    again = client.post(f"/api/cats/{cat}/report", headers=_h("reporter-01"), data={"reason": "spam"})
    assert again.json()["reported"] is False
    client.post(f"/api/cats/{cat}/report", headers=_h("reporter-02"))
    assert client.post(f"/api/cats/{cat}/report", headers=_h("reporter-03"), data={"reason": "bogus"}).status_code == 400
    assert client.post("/api/cats/missing/report", headers=_h("reporter-01")).status_code == 404

    other, _ = _cat(client, OWNER, "Clean")
    rows = client.get("/api/admin/cats", headers=ADMIN).json()
    assert [r["id"] for r in rows] == [cat, other]  # reported first
    assert rows[0]["reports_count"] == 2 and rows[0]["sighting_count"] == 1
    only = client.get("/api/admin/cats", params={"reported_only": "true"}, headers=ADMIN).json()
    assert [r["id"] for r in only] == [cat]
    named = client.get("/api/admin/cats", params={"q": "clea"}, headers=ADMIN).json()
    assert [r["id"] for r in named] == [other]
    assert client.get("/api/admin/cats", params={"limit": 0}, headers=ADMIN).status_code == 400
    assert client.get("/api/admin/cats").status_code in (401, 404)


def test_admin_force_merge_records_action(client):
    keep, _ = _cat(client, OWNER, "Keep")
    drop, s2 = _cat(client, "owner-mod-02", "Drop")
    res = client.post(
        f"/api/admin/cats/{keep}/merge",
        params={"reason": "duplicate profile"},
        headers={**ADMIN, "X-Admin-Label": "bob"},
        data={"from_cat_id": drop},
    )
    assert res.status_code == 200
    assert client.get(f"/api/cats/{drop}").status_code == 404
    assert client.get(f"/api/sightings/{s2}").json()["cat_id"] == keep

    merged = [a for a in client.get("/api/admin/actions", headers=ADMIN).json() if a["action"] == "merge_cats"]
    assert merged[0]["sighting_id"] == keep and merged[0]["admin_label"] == "bob"

    assert client.post(f"/api/admin/cats/{keep}/merge", headers=ADMIN, data={"from_cat_id": keep}).status_code == 400
    assert client.post(f"/api/admin/cats/{keep}/merge", headers=ADMIN, data={"from_cat_id": "nope"}).status_code == 404


def test_bulk_hide_unhide_delete(client):
    ids = [create_sighting(client, f"owner-bulk-{i}").json()["id"] for i in range(3)]
    world = {"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180}

    res = client.post(
        "/api/admin/sightings/bulk",
        params={"reason": "spam wave"},
        headers=ADMIN,
        data={"action": "hide", "ids": ",".join(ids[:2] + ["ghost"])},
    )
    assert res.json() == {"processed": 2, "not_found": ["ghost"]}
    assert [d["id"] for d in client.get("/api/sightings", params=world).json()] == [ids[2]]
    hides = [a for a in client.get("/api/admin/actions", headers=ADMIN).json() if a["action"] == "hide"]
    assert len(hides) == 2 and all(a["reason"] == "spam wave" for a in hides)

    client.post("/api/admin/sightings/bulk", headers=ADMIN, data={"action": "unhide", "ids": ids[0]})
    assert len(client.get("/api/sightings", params=world).json()) == 2

    client.post("/api/admin/sightings/bulk", headers=ADMIN, data={"action": "delete", "ids": ",".join(ids)})
    assert client.get("/api/sightings", params=world).json() == []


def test_bulk_validation(client):
    bad = client.post("/api/admin/sightings/bulk", headers=ADMIN, data={"action": "explode", "ids": "a"})
    assert bad.status_code == 400
    empty = client.post("/api/admin/sightings/bulk", headers=ADMIN, data={"action": "hide", "ids": " , "})
    assert empty.status_code == 400
    many = client.post(
        "/api/admin/sightings/bulk",
        headers=ADMIN,
        data={"action": "hide", "ids": ",".join(f"id{i}" for i in range(101))},
    )
    assert many.status_code == 400
