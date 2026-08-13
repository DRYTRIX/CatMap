"""Tests for user-submitted app issue reports."""

from unittest.mock import patch

from app.config import get_settings
from app.models import IssueReport

ADMIN = {"X-Admin-Token": "test-admin"}
DEVICE = {"X-Device-Token": "device-issue-1"}


def _submit(client, category="bug", message="Something broke", page_url="", token="device-issue-1"):
    return client.post(
        "/api/issues",
        headers={"X-Device-Token": token},
        data={"category": category, "message": message, "page_url": page_url},
    )


def test_submit_issue_creates_row(client):
    res = _submit(client, message="Map won't load")
    assert res.status_code == 201
    body = res.json()
    assert body["submitted"] is True
    assert body["id"]

    from app.database import SessionLocal

    with SessionLocal() as db:
        row = db.get(IssueReport, body["id"])
        assert row is not None
        assert row.category == "bug"
        assert row.message == "Map won't load"
        assert row.status == "open"
        assert row.device_token == "device-issue-1"


def test_submit_issue_requires_device_token(client):
    res = client.post(
        "/api/issues",
        data={"category": "bug", "message": "hello"},
    )
    assert res.status_code == 400


def test_submit_issue_validates_category(client):
    res = _submit(client, category="invalid")
    assert res.status_code == 400
    assert "category" in res.json()["detail"].lower()


def test_submit_issue_validates_message(client):
    empty = _submit(client, message="   ")
    assert empty.status_code == 400

    long_msg = _submit(client, message="x" * 2001)
    assert long_msg.status_code == 400


def test_submit_issue_triggers_telegram(client, monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-bot-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "123456789")
    get_settings.cache_clear()

    with patch("app.notifications.notify_telegram") as notify:
        res = _submit(client, category="wrong_data", message="Wrong pin location")

    assert res.status_code == 201
    issue_id = res.json()["id"]
    notify.assert_called_once()
    text = notify.call_args.args[0]
    assert "<b>Issue report</b>" in text
    assert f"Id: {issue_id}" in text
    assert "wrong_data" in text
    assert "Wrong pin location" in text

    get_settings.cache_clear()


def test_submit_bug_triggers_telegram_bug_title(client, monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-bot-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "123456789")
    get_settings.cache_clear()

    with patch("app.notifications.notify_telegram") as notify:
        res = _submit(client, category="bug", message="Crash on load")

    assert res.status_code == 201
    text = notify.call_args.args[0]
    assert "<b>Bug report</b>" in text
    assert f"Id: {res.json()['id']}" in text

    get_settings.cache_clear()


def test_submit_issue_skips_telegram_when_unconfigured(client, monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)
    get_settings.cache_clear()

    with patch("app.notifications.httpx.post") as post:
        res = _submit(client)

    assert res.status_code == 201
    post.assert_not_called()
    get_settings.cache_clear()


def test_admin_issues_requires_token(client):
    _submit(client)
    assert client.get("/api/admin/issues").status_code == 401
    assert client.get("/api/admin/issues", headers={"X-Admin-Token": "wrong"}).status_code == 401


def test_admin_can_list_resolve_and_delete_issues(client):
    res = _submit(client, category="abuse", message="Spam content", page_url="https://example.com")
    issue_id = res.json()["id"]

    listed = client.get("/api/admin/issues", headers=ADMIN)
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["id"] == issue_id
    assert rows[0]["category"] == "abuse"
    assert rows[0]["status"] == "open"

    open_only = client.get("/api/admin/issues?status=open", headers=ADMIN)
    assert len(open_only.json()) == 1

    resolved = client.post(f"/api/admin/issues/{issue_id}/resolve", headers=ADMIN)
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"

    resolved_only = client.get("/api/admin/issues?status=resolved", headers=ADMIN)
    assert len(resolved_only.json()) == 1

    deleted = client.delete(f"/api/admin/issues/{issue_id}", headers=ADMIN)
    assert deleted.status_code == 204
    assert client.get("/api/admin/issues", headers=ADMIN).json() == []


def test_admin_issue_not_found(client):
    assert client.post("/api/admin/issues/missing/resolve", headers=ADMIN).status_code == 404
    assert client.delete("/api/admin/issues/missing", headers=ADMIN).status_code == 404


def test_build_issue_notification():
    from app.notifications import build_issue_notification

    text = build_issue_notification(
        issue_id="iss-123",
        category="bug",
        message="App crashed",
        page_url="https://catmap.example.com/?s=abc",
        public_site_url="https://catmap.example.com",
    )
    assert "<b>Bug report</b>" in text
    assert "Id: iss-123" in text
    assert "bug" in text
    assert "App crashed" in text
    assert "https://catmap.example.com/?s=abc" in text
    assert "/admin" in text


def test_build_issue_notification_truncates_long_message():
    from app.notifications import _MAX_ISSUE_MSG, build_issue_notification

    long_msg = "x" * (_MAX_ISSUE_MSG + 50)
    text = build_issue_notification(
        issue_id="iss-long",
        category="other",
        message=long_msg,
        page_url=None,
        public_site_url="https://catmap.example.com",
    )
    assert "<b>Issue report</b>" in text
    assert "…" in text
    assert long_msg not in text
    assert "x" * 100 in text
