'use strict';

const test = require('node:test');
const assert = require('node:assert');

process.env.API_TOKEN = 'integration-test-token-value';
const app = require('../src/server');
const notes = require('../src/notes');

// Start the app on an ephemeral port so the tests never clash with a port
// that is already in use.
function withServer(fn) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      try {
        await fn(base);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

test('GET /health reports healthy', () => withServer(async (base) => {
  const res = await fetch(`${base}/health`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).status, 'healthy');
}));

test('POST /api/notes without a token is rejected', () => withServer(async (base) => {
  const res = await fetch(`${base}/api/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'sneaky', body: 'no token' }),
  });
  assert.strictEqual(res.status, 401);
}));

test('POST /api/notes with a valid token creates a note', () => withServer(async (base) => {
  notes.reset();
  const res = await fetch(`${base}/api/notes`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.API_TOKEN}`,
    },
    body: JSON.stringify({ title: 'authorised', body: 'this one works' }),
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual((await res.json()).title, 'authorised');
}));

test('the HTML view escapes a stored script tag', () => withServer(async (base) => {
  notes.reset();
  notes.create({ title: '<script>alert(1)</script>', body: 'xss attempt' });
  const html = await (await fetch(`${base}/`)).text();
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
}));

test('security headers are present on every response', () => withServer(async (base) => {
  const res = await fetch(`${base}/health`);
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
  assert.strictEqual(res.headers.get('x-powered-by'), null);
}));
