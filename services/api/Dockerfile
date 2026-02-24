FROM python:3.12-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgmp-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy project files and install (editable needs src/ present)
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir -e ".[dev]"

# Copy tests and keys
COPY tests/ ./tests/
COPY keys/ ./keys/

# Copy Alembic config
COPY alembic.ini ./
COPY alembic/ ./alembic/

# Run migrations and start server
CMD ["sh", "-c", "alembic upgrade head && uvicorn tbg.main:app --host 0.0.0.0 --port 8000 --reload"]
