import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from .config import get_settings
from .database import engine, init_db
from .ratelimit import limiter
from .routers import admin, sightings

logger = logging.getLogger("catmap")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if settings.cors_origins.strip() == "*":
        logger.warning(
            "CORS_ORIGINS is '*' — set explicit origins before a public launch."
        )
    if not settings.admin_token:
        logger.warning("ADMIN_TOKEN is unset — /api/admin moderation is disabled.")
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


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sightings.router)
app.include_router(admin.router)


@app.get("/healthz", tags=["meta"])
def healthz() -> JSONResponse:
    """Liveness + DB connectivity check."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return JSONResponse({"status": "ok", "db": "ok"})
    except Exception:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"status": "degraded", "db": "down"})
