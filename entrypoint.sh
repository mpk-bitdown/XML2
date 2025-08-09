#!/bin/sh
set -e
ROOT="/app/deploy_ready_app"
TARGET="$ROOT"

# Buscar app.py si no está en la raíz esperada
if [ ! -f "$ROOT/app.py" ]; then
  CAND=$(find "$ROOT" -maxdepth 2 -type f -name app.py | head -n1 || true)
  if [ -n "$CAND" ]; then
    TARGET=$(dirname "$CAND")
  fi
fi

echo "[entrypoint] Working dir: $TARGET"
cd "$TARGET"

exec gunicorn ${GUNICORN_APP_MODULE:-app:app}   --bind 0.0.0.0:${PORT:-8080}   --workers ${GUNICORN_WORKERS:-3}   --threads ${GUNICORN_THREADS:-4}   --timeout ${GUNICORN_TIMEOUT:-120}
