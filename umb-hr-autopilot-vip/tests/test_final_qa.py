"""PHASE 12 Final QA: concurrency, failover, security scan, responsive."""
import pathlib
import re
import threading

from app.automation.idempotency import MemoryIdempotency
from app.automation.modes import get_mode
from app.core.security import mint_token
from app.integrations.socket_adapter import get_adapter

ROOT = pathlib.Path(__file__).resolve().parents[1]
PATTERNS = ["BEGIN PRIVATE KEY", "AKfyc", "ya29.", "xoxb-", "xoxp-",
            "sk-ant-", "ghp_", "AIzaSy"]


def _hdr(role="HR"):
    return {"Authorization": "Bearer " + mint_token(sub="hr1", role=role)}


def test_no_hardcoded_secrets_in_source():
    hits = []
    for p in list((ROOT / "app").rglob("*.py")) + list((ROOT / "templates").glob("*.html")):
        text = p.read_text(encoding="utf-8")
        for pat in PATTERNS:
            if pat in text:
                hits.append(f"{p.name}:{pat}")
    assert hits == [], hits
    assert not (ROOT / ".env").exists()  # khong commit .env
    example = (ROOT / ".env.example").read_text(encoding="utf-8")
    for pat in PATTERNS:
        assert pat not in example, pat


def test_concurrent_idempotency_one_executes():
    m = MemoryIdempotency()
    wins, lock = [], threading.Lock()

    def go():
        if m.mark("BULK:SHARED"):
            with lock:
                wins.append(1)

    ts = [threading.Thread(target=go) for _ in range(20)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert len(wins) == 1


def test_failover_core_offline_never_500(client):
    h = _hdr()
    # Tat ca endpoint doc Core phai degraded-safe (200 hoac 4xx chu khong 500)
    for method, path, kwargs in [
        ("GET", "/api/dashboard/today", {}),
        ("GET", "/api/dashboard/brief", {}),
        ("GET", "/api/vip/attendance/live", {}),
        ("GET", "/api/vip/training/active", {}),
        ("GET", "/api/vip/system/health", {}),
    ]:
        r = client.get(path, headers=h, **kwargs)
        assert r.status_code != 500, path
    # Socket adapter offline van tra status (khong treo)
    st = get_adapter().status()
    assert "connected" in st and "subscribed" in st


def test_responsive_and_reduced_motion(client):
    html = client.get("/dashboard").text
    assert 'name="viewport"' in html
    for cls in ("md:flex", "max-w-6xl", "grid", "md:grid-cols-2"):
        assert cls in html, cls
    css = (ROOT / "static" / "app.css").read_text(encoding="utf-8")
    assert "prefers-reduced-motion" in css
    assert "dark" in css.lower()


def test_high_risk_always_assisted_or_manual():
    for name in ("fail_candidate", "hr_override_score", "promote_official", "system_reset"):
        assert get_mode(name) in ("ASSISTED", "MANUAL"), name


def test_license_totals_and_authz(client):
    # License admin can ADMIN (da cover) + anonymous bi chan
    assert client.get("/api/admin/license/keys").status_code == 401
    assert client.get("/api/admin/license/audit").status_code == 401
