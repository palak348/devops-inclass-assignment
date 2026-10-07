'use strict';

const crypto = require('node:crypto');

// The API token is NEVER hardcoded. It is read from the environment, which in
// Kubernetes is populated from a Secret. A missing token fails closed - the
// service refuses every write instead of silently allowing them.
function getApiToken() {
  const token = process.env.API_TOKEN;
  if (!token || token.length < 16) {
    return null;
  }
  return token;
}

// Constant-time comparison. A naive `a === b` leaks information through how
// long the comparison takes, which allows a timing attack to recover the token
// one character at a time.
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Pulls the bearer token out of an Authorization header.
function extractBearer(header) {
  if (typeof header !== 'string') {
    return null;
  }
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  return parts[1];
}

// Express middleware guarding every write route.
function requireAuth(req, res, next) {
  const expected = getApiToken();
  if (expected === null) {
    return res.status(503).json({ error: 'server is not configured with an API token' });
  }

  const presented = extractBearer(req.get('authorization'));
  if (presented === null || !safeCompare(presented, expected)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  return next();
}

module.exports = { getApiToken, safeCompare, extractBearer, requireAuth };
