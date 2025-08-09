# ---------- Stage 1: build frontend (tolerante a rutas) ----------
FROM node:20-alpine AS frontend-build
WORKDIR /build
# Copiamos TODO el repo al contexto de build
COPY . .
# Si existe deploy_ready_app/frontend, se construye; si no, se omite sin fallar
RUN if [ -d "deploy_ready_app/frontend" ]; then       cd deploy_ready_app/frontend &&       (npm ci || npm i) &&       npm run build;     else       echo "No frontend dir found, skipping build";     fi

# ---------- Stage 2: runtime Python ----------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1     PYTHONUNBUFFERED=1     PORT=8080     GUNICORN_WORKERS=3     GUNICORN_THREADS=4     GUNICORN_TIMEOUT=120
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends       build-essential curl ca-certificates     && rm -rf /var/lib/apt/lists/*

# Copiamos el backend completo
COPY ./deploy_ready_app /app/deploy_ready_app

# Copiamos el build del front, si fue generado
COPY --from=frontend-build /build/deploy_ready_app/frontend/dist /app/deploy_ready_app/static/app

WORKDIR /app/deploy_ready_app
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir gunicorn

EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:${PORT}/ || exit 1
CMD exec gunicorn app:app --bind 0.0.0.0:${PORT} --workers ${GUNICORN_WORKERS} --threads ${GUNICORN_THREADS} --timeout ${GUNICORN_TIMEOUT}
