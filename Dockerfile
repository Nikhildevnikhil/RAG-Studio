# ==============================================================================
# Stage 1: Build the React + Vite Frontend
# ==============================================================================
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Install dependencies
COPY frontend/package*.json ./
RUN npm ci

# Build production assets into dist/
COPY frontend/ ./
RUN npm run build

# ==============================================================================
# Stage 2: Production Python Backend & Unified Runner
# ==============================================================================
FROM python:3.11-slim

# Prevent Python from writing .pyc files & buffering stdout/stderr
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=7860 \
    HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONPATH=/home/user/app

# Install minimal OS build packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces enforces running as user with UID 1000
RUN useradd -m -u 1000 user
USER user
WORKDIR /home/user/app

# Install Python dependencies as non-root user
COPY --chown=user:user backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir --user -r backend/requirements.txt

# Copy backend application source code
COPY --chown=user:user backend/ ./backend/

# Copy built frontend assets from builder stage
COPY --chown=user:user --from=frontend-builder /app/frontend/dist ./frontend/dist

# Ensure storage directories exist with proper write permissions
RUN mkdir -p storage/documents storage/chromadb

# Expose default Hugging Face Space port
EXPOSE 7860

# Launch FastAPI web application
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "7860"]
