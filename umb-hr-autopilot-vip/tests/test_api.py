"""Foundation: API (health, auth guard, RBAC, degraded-safe)."""


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_system_health_structure(client):
    r = client.get("/api/vip/system/health")
    assert r.status_code == 200
    body = r.json()
    assert body["overall"] in ("HEALTHY", "DEGRADED", "FAILED")
    for k in ("NODE_CORE_API", "VIP_DATABASE", "REDIS", "SOCKET_IO",
              "GOOGLE_SHEET", "ZALO", "AI_PROVIDER", "LICENSE"):
        assert k in body["checks"], k


def test_auth_guards(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/dashboard/today").status_code == 401
    assert client.get("/api/vip/events/latest").status_code == 401


def test_login_wrong_rejected(client):
    r = client.post("/api/auth/login", json={"username": "nope", "password": "sai"})
    assert r.status_code == 401


def test_service_secret_not_in_browser_bundle(client):
    # Service secret khong bao gio xuat hien o HTML/JS phuc vu browser
    for path in ("/", "/dashboard"):
        html = client.get(path).text
        assert "VIP_SERVICE_SECRET" not in html
        assert "test-service-secret" not in html
