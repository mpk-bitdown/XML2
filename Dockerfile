# ---------- Stage 1: build frontend (Node + Vite) ----------
FROM node:20-alpine AS frontend-build
WORKDIR /app
# Copiamos sólo el frontend para cache eficiente
COPY deploy_ready_app/frontend ./frontend
# Instalar deps y construir (si no existe frontend, no falla)
RUN if [ -d "frontend" ]; then       cd frontend &&       npm ci || npm i &&       npm run build;     else       echo "No frontend directory found, skipping build.";     fi

# ---------- Stage 2: Python runtime ----------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1     PYTHONUNBUFFERED=1     PORT=8080     GUNICORN_WORKERS=3     GUNICORN_THREADS=4     GUNICORN_TIMEOUT=120
WORKDIR /app

# Dependencias del sistema
RUN apt-get update && apt-get install -y --no-install-recommends       build-essential curl ca-certificates     && rm -rf /var/lib/apt/lists/*

# Copiar backend completo
COPY deploy_ready_app /app/deploy_ready_app

# Copiar el build del frontend desde el stage 1 al static/app (si existe)
COPY --from=frontend-build /app/frontend/dist /app/deploy_ready_app/static/app

# Instalar requerimientos
WORKDIR /app/deploy_ready_app
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir gunicorn

# Exponer puerto Railway
EXPOSE ${PORT}

# Healthcheck simple
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:${PORT}/ || exit 1

# Comando de arranque
CMD exec gunicorn app:app --bind 0.0.0.0:${PORT} --workers ${GUNICORN_WORKERS} --threads ${GUNICORN_THREADS} --timeout ${GUNICORN_TIMEOUT}
