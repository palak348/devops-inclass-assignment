# ---- Stage 1: build/test ----------------------------------------------------
# A separate stage keeps test tooling and source out of the final image.
FROM node:22-alpine AS builder

WORKDIR /build
COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY tests/ ./tests/

# Fail the image build if the tests fail.
RUN node --test

# ---- Stage 2: runtime -------------------------------------------------------
FROM node:22-alpine AS runtime

# Run as a non-root user.
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY --from=builder --chown=app:app /build/src ./src
COPY --from=builder --chown=app:app /build/package.json ./

USER app

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
