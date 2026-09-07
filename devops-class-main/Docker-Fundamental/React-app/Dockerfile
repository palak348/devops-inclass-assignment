# ---------- Stage 1: build the React app ----------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json .
RUN npm install

COPY vite.config.js .
COPY index.html .
COPY src ./src

RUN npm run build

# ---------- Stage 2: serve the built files ----------
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
