
# Frontend (React + Vite) — Gestión Documental

Nuevo frontend con **React + Vite**. Todo el fetch se hace con `axios` y un **interceptor** que añade `X-Session-Id` y `?session=<id>` y fuerza **no-cache**.  
El **estado** de `sessionId` está en **Zustand** y todas las **queries** tienen la sesión en la **queryKey** —por lo que **no heredan** datos.

## Variables
- `VITE_API_BASE` (ej: `https://web-production-xxxx.up.railway.app`)

## Scripts
```bash
pnpm i   # o npm i / yarn
pnpm dev
pnpm build
pnpm preview
```

## Flujo de sesión
- En **/sessions** → botón **Nueva sesión** crea la sesión (POST `/api/sessions`), setea `sessionId` y redirige a `/?session=<id>`.
- El Dashboard usa `useEnsureSession()` para garantizar que hay `?session=` y que el store la tenga.
- Charts consultan endpoints **siempre** con `sessionId` y no-cache; si es nueva sesión sin documentos, responden vacío.

## Integración
El backend actual en Flask sirve como API. Habilita CORS si lo necesitas.
