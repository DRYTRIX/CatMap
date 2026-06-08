from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # postgresql+psycopg://user:pass@host:5432/dbname
    database_url: str = "postgresql+psycopg://catmap:catmap@localhost:5432/catmap"

    # Comma-separated list of allowed CORS origins, or "*" for any.
    cors_origins: str = "*"

    # Maximum accepted upload size in megabytes.
    max_upload_mb: int = 10

    # Longest edge (px) of the stored full image and the thumbnail.
    image_max_edge: int = 1600
    thumbnail_max_edge: int = 320

    # Cap on how many dots a single bounding-box query may return.
    max_dots_per_query: int = 2000

    # Guard against decompression bombs: reject images above this pixel count.
    max_image_pixels: int = 50_000_000  # ~50 MP

    # Rate limits (slowapi syntax), keyed on device token then client IP.
    rate_limit_create: str = "20/hour"
    rate_limit_confirm: str = "120/hour"
    rate_limit_report: str = "40/hour"

    # Moderation: hide a sighting once it reaches this many distinct reports.
    auto_hide_threshold: int = 3

    # Token protecting the /api/admin endpoints. Empty disables admin routes.
    admin_token: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
