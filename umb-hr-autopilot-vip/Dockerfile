# UMB HR Autopilot VIP — production image (Render/Railway/VPS).
# Build context: um-bo-milk-app/umb-hr-autopilot-vip/ (monorepo).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Deps he thong toi thieu (bcrypt/psycopg wheels, khong can build tools)
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --upgrade pip \
    && pip install fastapi uvicorn "pydantic>=2.7" pydantic-settings "sqlalchemy>=2.0" \
       alembic httpx python-socketio redis pyjwt bcrypt jinja2 python-multipart \
       "psycopg[binary]" ortools

COPY app/ ./app/
COPY templates/ ./templates/
COPY static/ ./static/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY run_vip.py ./

# Render truyen PORT dong; uvicorn doc VIP_PORT, fallback 8001
ENV VIP_PORT=8001
EXPOSE 8001

# Tables Stage A tu tao khi startup (init_db); migration Alembic cho thay doi sau
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:'+__import__('os').environ.get('VIP_PORT','8001')+'/health')"
CMD ["python", "run_vip.py"]
