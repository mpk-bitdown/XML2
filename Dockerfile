# ---------- Stage 1: build frontend (Node Alpine) ----------
FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY . .
# Garantiza que exista dist aunque no haya frontend o falle el build
RUN mkdir -p deploy_ready_app/frontend/dist &&     if [ -d "deploy_ready_app/frontend" ]; then       cd deploy_ready_app/frontend && (npm ci || npm i) && npm run build || true;     else       echo "No frontend dir found, created empty dist";     fi

# ---------- Stage 2: Python runtime (Alpine) ----------
FROM python:3.12-alpine
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080     GUNICORN_WORKERS=3 GUNICORN_THREADS=4 GUNICORN_TIMEOUT=120

RUN apk add --no-cache curl
WORKDIR /app

# Copiamos TODO el backend primero para asegurar rutas
COPY ./deploy_ready_app /app/deploy_ready_app

# Instalamos dependencias con fallback (si no existe requirements, creamos vacío)
WORKDIR /app/deploy_ready_app
RUN if [ ! -f requirements.txt ]; then echo "" > requirements.txt; fi
RUN pip install --no-cache-dir --only-binary=:all: -r requirements.txt || pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir gunicorn

# Copiamos el build del front (si existe; la carpeta siempre existe por Stage 1)
RUN mkdir -p /app/deploy_ready_app/static/app
COPY --from=frontend-build /build/deploy_ready_app/frontend/dist /app/deploy_ready_app/static/app

EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:${PORT}/ || exit 1
CMD exec gunicorn app:app --bind 0.0.0.0:${PORT} --workers ${GUNICORN_WORKERS} --threads ${GUNICORN_THREADS} --timeout ${GUNICORN_TIMEOUT}
