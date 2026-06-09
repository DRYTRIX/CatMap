"""Share page HTML with Open Graph tags."""

from tests.conftest import create_sighting


def test_share_page_active_sighting(client):
    res = create_sighting(client, "device-aaaa", description="fluffy tabby on the porch")
    sighting_id = res.json()["id"]

    page = client.get(f"/s/{sighting_id}")
    assert page.status_code == 200
    assert "text/html" in page.headers["content-type"]
    body = page.text
    assert 'property="og:image"' in body
    assert f"/api/sightings/{sighting_id}/thumbnail" in body
    assert "fluffy tabby on the porch" in body
    assert 'content="0;url=/?s=' in body


def test_share_page_missing(client):
    assert client.get("/s/not-a-uuid").status_code == 404


def test_share_page_hidden(client):
    res = create_sighting(client, "device-aaaa")
    sighting_id = res.json()["id"]

    for i in range(3):
        client.post(
            f"/api/sightings/{sighting_id}/report",
            headers={"X-Device-Token": f"reporter-{i}"},
            data={"reason": "spam"},
        )

    assert client.get(f"/s/{sighting_id}").status_code == 404
