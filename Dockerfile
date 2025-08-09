# ---------- Stage 1: build frontend (Node + Alpine) ----------
FROM node:20-alpine AS frontend-build
WORKDIR /build
# Copiamos todo el repo al contexto (tolera cualquier estructura)
COPY . .
RUN if [ -d "deploy_ready_app/frontend" ]; then       cd deploy_ready_app/frontend &&       (npm ci || npm i) &&       npm run build;     else       echo "No frontend dir found, skipping build";     fi

# ---------- Stage 2: Python runtime (Alpine, sin apt-get) ----------
FROM python:3.12-alpine
ENV PYTHONDONTWRITEBYTECODE=1     PYTHONUNBUFFERED=1     PORT=8080     GUNICORN_WORKERS=3     GUNICORN_THREADS=4     GUNICORN_TIMEOUT=120
WORKDIR /app

# Paquetes mínimos y livianos
RUN apk add --no-cache curl

# Copiar backend
COPY ./deploy_ready_app /app/deploy_ready_app

# Copiar build del frontend (si existe)
COPY --from=frontend-build /build/deploy_ready_app/frontend/dist /app/deploy_ready_app/static/app

# Instalar dependencias de Python (intenta wheels primero para evitar compilación)
WORKDIR /app/deploy_ready_app
RUN pip install --no-cache-dir --only-binary=:all: -r requirements.txt || pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir gunicorn

EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:${PORT}/ || exit 1
CMD exec gunicorn app:app --bind 0.0.0.0:${PORT} --workers ${GUNICORN_WORKERS} --threads ${GUNICORN_THREADS} --timeout ${GUNICORN_TIMEOUT}
