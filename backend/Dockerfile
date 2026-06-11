FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

WORKDIR /app

# Pillow wheels are self-contained, but keep build tooling minimal & current.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts ./scripts
RUN python scripts/fetch_model.py \
    && test "$(stat -c%s models/ssd_mobilenet_v1_12.onnx)" -gt 20000000

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

EXPOSE 8000

# Render injects $PORT; default to 8000 locally.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
