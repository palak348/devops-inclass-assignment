# ---------- Stage 1: build the React app with Node ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Stage 2: serve the static files with Nginx ----------
# nginx-unprivileged runs as the non-root "nginx" user (uid 101) and listens on
# 8080, so no root and no privileged port is needed. Node and the source code
# stay behind in the build stage.
FROM nginxinc/nginx-unprivileged:1.30-alpine

# Where /api requests are proxied to. Overridden per environment
# (docker compose: backend:8000, Kubernetes: the backend Service name).
ENV BACKEND_URL=http://backend:8000

# The official entrypoint renders templates/*.template into conf.d/ with envsubst.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
