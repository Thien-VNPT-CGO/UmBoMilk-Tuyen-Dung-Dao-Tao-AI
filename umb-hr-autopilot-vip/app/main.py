from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api import ai_command, auth, automation, dashboard, events, health, inbox, interviews, license, notifications, scheduling, test_center, training
from app.core.paths import static_dir, templates_dir
from app.core.logging import get_logger
from app.db.base import init_db
from app.integrations.socket_adapter import get_adapter

log = get_logger("vip.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        get_adapter().start_background()
    except Exception as e:
        log.info("socket adapter not started", extra={"ctx": {"error": str(e)[:200]}})
    yield


app = FastAPI(title="UMB HR Autopilot VIP", version="0.2.0", lifespan=lifespan)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(events.router)
app.include_router(inbox.router)
app.include_router(notifications.router)
app.include_router(interviews.router)
app.include_router(training.router)
app.include_router(test_center.router)
app.include_router(scheduling.router)
app.include_router(ai_command.router)
app.include_router(automation.router)
app.include_router(license.router)
app.include_router(license.admin)

templates = Jinja2Templates(directory=templates_dir())


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse(request, "login.html", {"request": request})


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard_page(request: Request):
    return templates.TemplateResponse(request, "dashboard.html", {"request": request})


@app.get("/inbox", response_class=HTMLResponse)
def inbox_page(request: Request):
    return templates.TemplateResponse(request, "inbox.html", {"request": request})


try:
    app.mount("/static", StaticFiles(directory=static_dir()), name="static")
except Exception:
    pass
