import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from .cat_detection import get_detection_status
from .config import get_settings
from .database import engine, run_migrations
from .logging_config import configure_logging
from .notifications import notify_startup
from .ratelimit import limiter
from .routers import admin, cats, share, sightings, stats

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger("catmap")

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    if settings.cors_origins.strip() == "*":
        logger.warning(
            "CORS_ORIGINS is '*' — set explicit origins before a public launch."
        )
    if not settings.admin_token:
        logger.warning("ADMIN_TOKEN is unset — /api/admin moderation is disabled.")
    await asyncio.to_thread(notify_startup)
    yield


app = FastAPI(title="CatMap API", version="1.0.0", lifespan=lifespan)

# Rate limiting (slowapi).
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests — Try Again Later."},
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-Frame-Options", "DENY")
    return response


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Versioned API: /api/v1/... is the canonical form. /api/... is kept as an
# unversioned alias for backward compatibility with existing clients.
for api_prefix, in_schema in (("/api", True), ("/api/v1", False)):
    app.include_router(sightings.router, prefix=api_prefix, include_in_schema=in_schema)
    app.include_router(cats.router, prefix=api_prefix, include_in_schema=in_schema)
    app.include_router(stats.router, prefix=api_prefix, include_in_schema=in_schema)
    app.include_router(admin.router, prefix=api_prefix, include_in_schema=in_schema)

app.include_router(share.router)


@app.get("/healthz", tags=["meta"])
def healthz() -> JSONResponse:
    """Liveness + DB connectivity check."""
    cat_status = get_detection_status()
    cat_detection = "ready" if cat_status == "ready" else "unavailable"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return JSONResponse({"status": "ok", "db": "ok", "cat_detection": cat_detection})
    except Exception:  # noqa: BLE001
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "db": "down", "cat_detection": cat_detection},
        )
