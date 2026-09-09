"""Entry cho PyInstaller .exe (va chay truc tiep): python run_vip.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402  (import truc tiep de PyInstaller trace)

if __name__ == "__main__":
    s = get_settings()
    host = os.environ.get("VIP_HOST", s.HOST)
    port = int(os.environ.get("VIP_PORT", s.PORT))
    print(f"UMB HR Autopilot VIP -> http://{host}:{port} (Core: {s.NODE_CORE_URL})")
    uvicorn.run(app, host=host, port=port, log_level="info")
