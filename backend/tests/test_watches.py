"""Watch/follow sightings and cat profiles, including list pagination."""

from tests.conftest import create_sighting

TOKEN = "watch-dev"


def test_watch_and_unwatch_sighting(client):
    sid = create_sighting(client, TOKEN).json()["id"]

    add = client.post(
        "/api/watches",
        data={"target_type": "sighting", "target_id": sid},
        headers={"X-Device-Token": TOKEN},
    )
    assert add.status_code == 201
    assert add.json()["watching"] is True

    listed = client.get("/api/watches", headers={"X-Device-Token": TOKEN})
    assert listed.status_code == 200
    assert any(w["target_id"] == sid for w in listed.json())

    remove = client.delete(
        "/api/watches",
        params={"target_type": "sighting", "target_id": sid},
        headers={"X-Device-Token": TOKEN},
    )
    assert remove.status_code == 200
    assert remove.json()["watching"] is False

    listed_after = client.get("/api/watches", headers={"X-Device-Token": TOKEN})
    assert all(w["target_id"] != sid for w in listed_after.json())


def test_watch_invalid_target_type(client):
    res = client.post(
        "/api/watches",
        data={"target_type": "nonsense", "target_id": "x"},
        headers={"X-Device-Token": TOKEN},
    )
    assert res.status_code == 400


def test_watches_pagination(client):
    token = "watch-page-dev"
    ids = []
    for i in range(3):
        sid = create_sighting(token=token, client=client, lat=40.0 + i * 0.01, lng=-3.0).json()["id"]
        client.post(
            "/api/watches",
            data={"target_type": "sighting", "target_id": sid},
            headers={"X-Device-Token": token},
        )
        ids.append(sid)

    page1 = client.get(
        "/api/watches", params={"limit": 2}, headers={"X-Device-Token": token}
    ).json()
    assert len(page1) == 2
    assert [w["target_id"] for w in page1] == list(reversed(ids))[:2]

    page2 = client.get(
        "/api/watches",
        params={"limit": 2, "offset": 2},
        headers={"X-Device-Token": token},
    ).json()
    assert len(page2) == 1
    assert page2[0]["target_id"] == ids[0]
