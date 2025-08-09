# Front Node + Vite integrado en Flask

1) Construir el front (local):
   ```bash
   cd frontend
   npm i
   npm run build
   ```
   Esto genera `static/app/` con el build.

2) Subir a Git y desplegar en Railway. Flask servirá `/` desde `static/app/index.html`.
