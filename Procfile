web: gunicorn app:app --workers=2 --threads=4 --timeout 120
release: bash -lc 'cd frontend && (command -v npm >/dev/null 2>&1 && npm ci && npm run build) || true'
