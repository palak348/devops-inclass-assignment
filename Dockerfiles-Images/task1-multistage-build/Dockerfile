# ---------- Stage 1: build ----------
FROM node:18-alpine AS build

WORKDIR /app

# Install dependencies (cached separately from source copy)
COPY package.json ./
RUN npm install --omit=dev

# Copy application source
COPY server.js ./

# ---------- Stage 2: runtime ----------
FROM node:18-alpine AS runtime

WORKDIR /app

# Only bring over what's needed to run the app — no build tools,
# no dev dependencies, smaller final image
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

CMD ["node", "server.js"]
