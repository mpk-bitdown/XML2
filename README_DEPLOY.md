# Repo v49
- Dockerfile asegura que siempre exista /build/deploy_ready_app/frontend/dist (aunque no haya frontend o falle el build), evitando el error de COPY not found.
- Railway: Builder= Dockerfile, Clear cache & deploy.
