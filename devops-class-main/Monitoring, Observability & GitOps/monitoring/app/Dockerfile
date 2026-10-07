# =============================================================================
# The demo app has no dependencies, so there is nothing to install and no
# build stage to run. One stage, one COPY.
# =============================================================================
FROM node:22-alpine

WORKDIR /app

# Run as the image's own unprivileged `node` user (uid 1000), not root.
COPY --chown=node:node server.js ./

USER node

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
