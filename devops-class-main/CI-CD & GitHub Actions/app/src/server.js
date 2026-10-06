// Minimal HTTP server using only the Node standard library, so the image
// needs no dependencies and the build stays fast and reproducible.
const http = require('http');
const { add, subtract, multiply, divide, modulo } = require('./calculator');

const PORT = process.env.PORT || 3000;
const APP_VERSION = process.env.APP_VERSION || '1.1.0';
const ENVIRONMENT = process.env.ENVIRONMENT || 'local';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Liveness/readiness endpoint used by Kubernetes probes.
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'healthy', version: APP_VERSION }));
  }

  if (url.pathname === '/api/calculate') {
    const a = Number(url.searchParams.get('a'));
    const b = Number(url.searchParams.get('b'));
    const op = url.searchParams.get('op') || 'add';

    try {
      const ops = { add, subtract, multiply, divide, modulo };
      if (!ops[op]) throw new Error(`Unknown operation: ${op}`);
      const result = ops[op](a, b);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ a, b, op, result }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<h1>CI/CD Demo App</h1>
<p>version: ${APP_VERSION}</p>
<p>environment: ${ENVIRONMENT}</p>
<p>hostname: ${process.env.HOSTNAME || 'unknown'}</p>
<p>Try <a href="/api/calculate?a=6&b=7&op=multiply">/api/calculate?a=6&b=7&op=multiply</a></p>`);
});

// Only listen when run directly, so tests can import without binding a port.
if (require.main === module) {
  server.listen(PORT, () => console.log(`listening on port ${PORT}`));
}

module.exports = server;
