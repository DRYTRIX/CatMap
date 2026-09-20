"""Cat duplicate detection: "same cat?" suggestions and merging."""

from tests.conftest import create_sighting

A = "owner-aaaa1"
B = "owner-bbbb1"
STRANGER = "stranger-01"


def _h(token):
    return {"X-Device-Token": token}


def _cat(client, token, name, **sighting_kwargs):
    sid = create_sighting(client, token, **sighting_kwargs).json()["id"]
    cat = client.post("/api/cats", headers=_h(token), data={"sighting_ids": sid, "name": name})
    return cat.json()["id"], sid


def test_merge_own_profiles_immediately(client):
    keep, s1 = _cat(client, A, "Ginger")
    drop, s2 = _cat(client, A, "")
    res = client.post(
        f"/api/cats/{keep}/merge-suggestions", headers=_h(A), data={"from_cat_id": drop}
    )
    assert res.status_code == 201 and res.json()["merged"] is True

    assert client.get(f"/api/cats/{drop}").status_code == 404
    assert client.get(f"/api/sightings/{s2}").json()["cat_id"] == keep
    assert client.get(f"/api/cats/{keep}").json()["sighting_count"] == 2


def test_merge_requires_both_owners(client):
    keep, s1 = _cat(client, A, "Ginger")
    drop, s2 = _cat(client, B, "Orange")

    sug = client.post(
        f"/api/cats/{keep}/merge-suggestions", headers=_h(STRANGER), data={"from_cat_id": drop}
    )
    assert sug.status_code == 201
    sid = sug.json()["id"]
    assert sug.json()["merged"] is False
    # Duplicate suggestion (either direction) is rejected.
    again = client.post(
        f"/api/cats/{drop}/merge-suggestions", headers=_h(STRANGER), data={"from_cat_id": keep}
    )
    assert again.status_code == 409

    # Non-owner can't respond; owner A can see it and approve their side.
    assert client.post(f"/api/cats/merge-suggestions/{sid}/accept", headers=_h(STRANGER)).status_code == 403
    listed = client.get(f"/api/cats/{keep}/merge-suggestions", headers=_h(A)).json()
    assert [x["id"] for x in listed] == [sid] and listed[0]["can_respond"] is True
    first = client.post(f"/api/cats/merge-suggestions/{sid}/accept", headers=_h(A))
    assert first.status_code == 200 and first.json()["merged"] is False
    assert client.get(f"/api/cats/{drop}").status_code == 200  # not merged yet

    done = client.post(f"/api/cats/merge-suggestions/{sid}/accept", headers=_h(B))
    assert done.json()["merged"] is True
    assert client.get(f"/api/cats/{drop}").status_code == 404
    assert client.get(f"/api/sightings/{s2}").json()["cat_id"] == keep


def test_reject_keeps_both_profiles(client):
    keep, _ = _cat(client, A, "Ginger")
    drop, _ = _cat(client, B, "Orange")
    sid = client.post(
        f"/api/cats/{keep}/merge-suggestions", headers=_h(STRANGER), data={"from_cat_id": drop}
    ).json()["id"]
    assert client.post(f"/api/cats/merge-suggestions/{sid}/reject", headers=_h(B)).json()["status"] == "rejected"
    assert client.get(f"/api/cats/{drop}").status_code == 200
    assert client.get(f"/api/cats/{keep}/merge-suggestions", headers=_h(A)).json() == []
    # A rejected suggestion can't be answered again.
    assert client.post(f"/api/cats/merge-suggestions/{sid}/accept", headers=_h(B)).status_code == 404


def test_merge_combines_hearts_and_watches_without_duplicates(client):
    keep, _ = _cat(client, A, "Ginger")
    drop, _ = _cat(client, A, "Orange")
    for token, cats in (("fan-both-01", (keep, drop)), ("fan-drop-01", (drop,))):
        for cat in cats:
            client.post(
                "/api/hearts",
                headers=_h(token),
                data={"target_type": "cat", "target_id": cat},
            )
            client.post(
                "/api/watches",
                headers=_h(token),
                data={"target_type": "cat", "target_id": cat},
            )

    client.post(f"/api/cats/{keep}/merge-suggestions", headers=_h(A), data={"from_cat_id": drop})

    profile = client.get(f"/api/cats/{keep}", headers=_h("fan-drop-01")).json()
    assert profile["hearts_count"] == 2  # two distinct fans, "both" not double counted
    assert profile["hearted"] is True and profile["watching"] is True
    assert client.get(f"/api/cats/{keep}", headers=_h("fan-both-01")).json()["hearts_count"] == 2


def test_merge_keeps_name_and_validates(client):
    keep, _ = _cat(client, A, "")
    drop, _ = _cat(client, A, "Orange")
    client.post(f"/api/cats/{keep}/merge-suggestions", headers=_h(A), data={"from_cat_id": drop})
    assert client.get(f"/api/cats/{keep}").json()["name"] == "Orange"

    assert client.post(
        f"/api/cats/{keep}/merge-suggestions", headers=_h(A), data={"from_cat_id": keep}
    ).status_code == 400
    assert client.post(
        f"/api/cats/{keep}/merge-suggestions", headers=_h(A), data={"from_cat_id": "nope"}
    ).status_code == 404
