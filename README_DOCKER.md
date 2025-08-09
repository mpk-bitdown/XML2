# Despliegue con Docker (multi-stage) para Railway

## Build local
```bash
docker build -t edudown-app .
docker run -p 8080:8080 edudown-app
```

## Railway
- Proyecto -> New Service -> Deploy from Repo (usa este repo con Dockerfile).
- Railway detecta el Dockerfile y construye:
  - Stage 1: build del frontend con Node (Vite).
  - Stage 2: imagen de Python con Flask + Gunicorn, sirviendo `static/app`.
- La app escucha en el puerto `$PORT` (Railway lo inyecta).

## Notas
- Si no tienes `deploy_ready_app/frontend/`, el stage de Node se salta sin fallar.
- El volumen `deploy_ready_app/uploads/` está ignorado en `.dockerignore` por defecto.
```
