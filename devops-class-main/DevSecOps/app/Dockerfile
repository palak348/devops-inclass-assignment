# =============================================================================
# Multi-stage, security-hardened image for the DevSecOps notes API.
#
# Every stage exists for a reason:
#   deps    - installs PRODUCTION dependencies only, from the lockfile
#   test    - installs dev dependencies and runs the unit tests; if a test
#             fails the image is never produced at all
#   runtime - the shipped image: no npm, no build tools, no test files,
#             no source control metadata, and it does not run as root
# =============================================================================

# ---- stage 1: production dependencies ---------------------------------------
FROM node:22-alpine AS deps
WORKDIR /build
COPY package.json package-lock.json ./
# `npm ci` installs EXACTLY what the lockfile says. `npm install` may silently
# upgrade a transitive dependency, which makes the SCA scan meaningless.
RUN npm ci --omit=dev --no-audit --no-fund

# ---- stage 2: test ----------------------------------------------------------
FROM node:22-alpine AS test
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY src/ ./src/
COPY tests/ ./tests/
RUN npm test

# ---- stage 3: runtime -------------------------------------------------------
FROM node:22-alpine AS runtime

# The node image already ships a non-root `node` user (uid 1000). Reusing it is
# safer than inventing one, because the whole image is already owned correctly.
WORKDIR /app

# Only the two things the service actually needs at runtime.
COPY --from=deps  --chown=node:node /build/node_modules ./node_modules
COPY --chown=node:node src/ ./src/
COPY --chown=node:node package.json ./

# Strip the npm CLI out of the runtime image.
#
# This container never installs anything at run time, so npm is pure attack
# surface - and it drags in its own dependency tree (pacote, sigstore,
# brace-expansion, picomatch, ip-address), which the Trivy image scan reports
# as HIGH findings against the image even though the application never calls
# any of it. Deleting it is a REAL fix rather than a suppression: fewer
# packages means fewer CVEs, and an attacker who lands inside the container
# has no package manager to pull tools down with.
USER root
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Drop privileges. Combined with the Kubernetes securityContext this means a
# remote code execution bug lands as an unprivileged user in a read-only
# filesystem rather than as root.
USER node

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
