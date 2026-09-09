import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("VIP_SECRET_KEY", "test-secret-key-32-chars-minimum")
os.environ.setdefault("VIP_SERVICE_SECRET", "test-service-secret")
os.environ.setdefault("NODE_CORE_URL", "http://127.0.0.1:9")


@pytest.fixture()
def client():
    from app.main import app
    return TestClient(app)
