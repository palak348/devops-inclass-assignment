'use strict';

const express = require('express');
const notes = require('./notes');
const { requireAuth, getApiToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = process.env.APP_VERSION || '1.0.0';

// Reject oversized payloads outright - an unbounded body parser is a cheap
// denial-of-service target.
app.use(express.json({ limit: '64kb' }));

// Security headers, set by hand so each one is visible rather than hidden
// behind a library.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.removeHeader('X-Powered-By');          // stop advertising the framework
  next();
});

// ---- health and readiness -------------------------------------------------

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', version: VERSION });
});

// Readiness is NOT the same as liveness: the pod is alive but should not get
// traffic until it has the token it needs to do its job.
app.get('/ready', (req, res) => {
  if (getApiToken() === null) {
    return res.status(503).json({ status: 'not-ready', reason: 'API_TOKEN missing or too short' });
  }
  return res.json({ status: 'ready', notes: notes.count() });
});

// ---- notes API ------------------------------------------------------------

app.get('/api/notes', (req, res) => {
  res.json({ count: notes.count(), notes: notes.list() });
});

app.get('/api/notes/:id', (req, res) => {
  const note = notes.get(req.params.id);
  if (note === null) {
    return res.status(404).json({ error: 'note not found' });
  }
  return res.json(note);
});

app.post('/api/notes', requireAuth, (req, res) => {
  try {
    const note = notes.create(req.body);
    return res.status(201).json(note);
  } catch (err) {
    if (err.validation) {
      return res.status(400).json({ error: 'validation failed', details: err.validation });
    }
    // Never leak a stack trace to the client.
    return res.status(500).json({ error: 'internal error' });
  }
});

app.delete('/api/notes/:id', requireAuth, (req, res) => {
  const deleted = notes.remove(req.params.id);
  return res.status(deleted ? 204 : 404).end();
});

// ---- a tiny HTML view, deliberately escaped -------------------------------

app.get('/', (req, res) => {
  const rows = notes
    .list()
    .map((n) => `<li><strong>${notes.escapeHtml(n.title)}</strong> - ${notes.escapeHtml(n.body)}</li>`)
    .join('\n');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>DevSecOps Notes API</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto;">
  <h1>DevSecOps Notes API</h1>
  <p>Version ${notes.escapeHtml(VERSION)} &middot; served by <code>${notes.escapeHtml(process.env.HOSTNAME || 'local')}</code></p>
  <ul>${rows || '<li><em>no notes yet</em></li>'}</ul>
</body>
</html>`);
});

app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Only listen when run directly, so the tests can import the module.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`notes api listening on port ${PORT} (version ${VERSION})`);
  });
}

module.exports = app;
