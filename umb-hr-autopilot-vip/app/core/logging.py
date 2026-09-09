"""Structured JSON logging (Master §44). Cam log secret."""
from __future__ import annotations

import json
import logging
import sys

SECRET_KEYS = ("password", "token", "jwt", "secret", "private_key", "access_token",
               "api_key", "apikey", "activation", "authorization", "cookie")


def mask(obj):
    if isinstance(obj, dict):
        return {k: ("***" if any(s in str(k).lower() for s in SECRET_KEYS) else mask(v))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [mask(x) for x in obj]
    return obj


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        extra = getattr(record, "ctx", None)
        if isinstance(extra, dict):
            payload.update(mask(extra))
        return json.dumps(payload, ensure_ascii=False)


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger
