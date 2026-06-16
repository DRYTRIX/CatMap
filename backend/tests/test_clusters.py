"""Server-side grid clustering for zoomed-out map views."""

from tests.conftest import create_sighting

WORLD = {"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180}


def _clusters(client, zoom):
    return client.get("/api/sightings/clusters", params={**WORLD, "zoom": zoom}).json()


def test_clusters_honor_filters(client):
    """Filtering must work at every zoom level, including the clustered view."""
    create_sighting(client, "owner-001", lat=40.0, lng=-3.0, color="orange")
    create_sighting(client, "owner-001", lat=40.1, lng=-3.1, color="black")
    create_sighting(client, "owner-001", lat=40.2, lng=-3.2, is_stray="true")

    unfiltered = client.get("/api/sightings/clusters", params={**WORLD, "zoom": 4}).json()
    assert sum(c["count"] for c in unfiltered) == 3

    orange = client.get(
        "/api/sightings/clusters", params={**WORLD, "zoom": 4, "color": "orange"}
    ).json()
    assert sum(c["count"] for c in orange) == 1

    strays = client.get(
        "/api/sightings/clusters", params={**WORLD, "zoom": 4, "is_stray": "true"}
    ).json()
    assert sum(c["count"] for c in strays) == 1


def test_clusters_count_everything(client):
    # Three near each other, two far away.
    for _ in range(3):
        create_sighting(client, "owner-001", lat=40.0, lng=-3.0)
    create_sighting(client, "owner-001", lat=-33.0, lng=151.0)
    create_sighting(client, "owner-001", lat=35.0, lng=139.0)

    # Whatever the grid resolution, the total count is exact (nothing dropped).
    clusters = _clusters(client, zoom=4)
    assert sum(c["count"] for c in clusters) == 5


def test_clusters_split_by_zoom(client):
    create_sighting(client, "owner-001", lat=40.0, lng=-3.0)
    create_sighting(client, "owner-001", lat=-33.0, lng=151.0)

    # Coarse zoom may merge; fine zoom must separate the two distant points.
    fine = _clusters(client, zoom=10)
    assert len(fine) == 2
    assert {c["count"] for c in fine} == {1}


def test_clusters_respects_bbox(client):
    create_sighting(client, "owner-001", lat=40.0, lng=-3.0)
    create_sighting(client, "owner-001", lat=-33.0, lng=151.0)

    only_europe = client.get(
        "/api/sightings/clusters",
        params={"min_lat": 30, "max_lat": 50, "min_lng": -10, "max_lng": 10, "zoom": 6},
    ).json()
    assert sum(c["count"] for c in only_europe) == 1
