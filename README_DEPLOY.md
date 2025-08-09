# Despliegue con Docker (Alpine, sin apt-get)

- Builder: Dockerfile (raíz del repo)
- Clear cache & deploy en Railway si venías de un Dockerfile anterior.
- Stage 1: Node (alpine) compila `deploy_ready_app/frontend` si existe.
- Stage 2: Python (alpine) sirve Flask + Gunicorn sin `apt-get` (evita error 137).
