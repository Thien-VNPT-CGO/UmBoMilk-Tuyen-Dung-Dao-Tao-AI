"""Foundation: security (Master §36, §45) — khong hard-code, khong leak secret."""
from app.core import security
from app.core.config import get_settings
from app.core.logging import mask


def test_password_roundtrip():
    h = security.hash_password("MatKhau123")
    assert h != "MatKhau123"
    assert security.verify_password("MatKhau123", h)
    assert not security.verify_password("sai", h)


def test_token_roundtrip():
    t = security.mint_token(sub="hr1", role="HR", branch_scope=["CN1"])
    claims = security.decode_token(t)
    assert claims["sub"] == "hr1" and claims["role"] == "HR"
    assert claims["branch_scope"] == ["CN1"]


def test_service_auth_requires_secret():
    s = get_settings()
    assert s.SERVICE_SECRET, "test phai co VIP_SERVICE_SECRET tu conftest"
    assert security.check_service_auth("vip-service", "test-service-secret")
    assert not security.check_service_auth("vip-service", "sai-secret")
    assert not security.check_service_auth("khac", "test-service-secret")


def test_log_masking_no_secret_leak():
    out = mask({"username": "hr", "password": "x", "token": "abc",
                "nested": {"api_key": "k", "ok": 1}})
    assert out["password"] == "***" and out["token"] == "***"
    assert out["nested"]["api_key"] == "***" and out["nested"]["ok"] == 1
    assert "x" not in str(out) and "abc" not in str(out)
