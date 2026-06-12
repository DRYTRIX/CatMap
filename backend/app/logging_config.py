import json
import logging
import sys


class JsonFormatter(logging.Formatter):
    """Renders log records as single-line JSON for log aggregators."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in ("request_id", "method", "path", "status_code", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging(level: str = "INFO") -> None:
    """Give the "catmap" logger its own JSON-formatted stdout handler.

    Uses a dedicated, non-propagating logger so this doesn't fight with
    uvicorn's own logging configuration (which runs separately and may be
    set up before or after this call depending on how the app is started).
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    logger = logging.getLogger("catmap")
    logger.handlers = [handler]
    logger.setLevel(level.upper())
    logger.propagate = False
