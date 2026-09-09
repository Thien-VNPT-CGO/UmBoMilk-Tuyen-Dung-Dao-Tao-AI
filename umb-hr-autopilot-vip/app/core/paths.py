"""Duong dan tai nguyen: chay source vs chay .exe (PyInstaller frozen).

- Bundled (doc): sys._MEIPASS (templates/, static/).
- Ghi duoc (DB): thu muc chua file .exe (khong ghi vao _MEIPASS vi chi doc).
"""
from __future__ import annotations

import os
import sys


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def project_root() -> str:
    if is_frozen():
        return os.path.dirname(sys.executable)
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def resource_dir() -> str:
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return base
    return project_root()


def templates_dir() -> str:
    cand = os.path.join(resource_dir(), "templates")
    if os.path.isdir(cand):
        return cand
    return os.path.join(project_root(), "templates")


def static_dir() -> str:
    cand = os.path.join(resource_dir(), "static")
    if os.path.isdir(cand):
        return cand
    return os.path.join(project_root(), "static")


def default_db_path() -> str:
    return os.path.join(project_root(), "data", "vip.db")
