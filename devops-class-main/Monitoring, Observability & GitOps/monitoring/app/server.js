// =============================================================================
// Demo application for the monitoring stack.
//
// Deliberately has no dependencies - the Prometheus text exposition format is
// simple enough to emit by hand, and writing it by hand makes the four metric
// types visible rather than hidden behind a client library.
//
// Endpoints:
//   /          a page, so there is something to hit
//   /health    liveness  - is the process wedged?
//   /ready     readiness - can it serve traffic right now?
//   /metrics   Prometheus scrape target
//   /work      burns CPU, so CPU utilisation is demonstrable
//   /error     returns 500, so an error-rate alert is demonstrable
// =============================================================================

const http = require('http');

const PORT = process.env.PORT || 3000;
const VERSION = process.env.APP_VERSION || '1.0.0';
const START = Date.now();

// ---- metric state -----------------------------------------------------------
// A counter only ever goes up. Prometheus computes rates from the increase
// between scrapes, which is why a counter that resets on restart is still
// correct - rate() understands resets.
const requestsTotal = new Map(); // "path|status" -> count

// A histogram buckets observations so percentiles can be computed at query
// time. These bounds are in seconds and chosen around the latencies we expect.
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const durationBuckets = new Array(BUCKETS.length).fill(0);
let durationSum = 0;
let durationCount = 0;

// A gauge goes up and down. `ready` is flipped by /toggle-ready so the
// readiness probe can be seen taking a pod out of rotation without killing it.
let ready = true;

function recordRequest(path, status, seconds) {
  const key = `${path}|${status}`;
  requestsTotal.set(key, (requestsTotal.get(key) || 0) + 1);

  for (let i = 0; i < BUCKETS.length; i++) {
    if (seconds <= BUCKETS[i]) {
      durationBuckets[i]++;
    }
  }
  durationSum += seconds;
  durationCount++;
}

// ---- metrics endpoint -------------------------------------------------------
function renderMetrics() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const lines = [];

  // Every metric gets HELP and TYPE. Prometheus does not require them, but
  // they are what makes a metrics endpoint readable by someone who did not
  // write it.
  lines.push('# HELP app_build_info Build information. Always 1; the labels carry the data.');
  lines.push('# TYPE app_build_info gauge');
  lines.push(`app_build_info{version="${VERSION}",runtime="node${process.versions.node}"} 1`);

  lines.push('# HELP app_uptime_seconds Seconds since the process started.');
  lines.push('# TYPE app_uptime_seconds gauge');
  lines.push(`app_uptime_seconds ${((Date.now() - START) / 1000).toFixed(3)}`);

  lines.push('# HELP app_ready Whether the app is reporting itself ready to serve traffic.');
  lines.push('# TYPE app_ready gauge');
  lines.push(`app_ready ${ready ? 1 : 0}`);

  lines.push('# HELP app_requests_total Total HTTP requests handled.');
  lines.push('# TYPE app_requests_total counter');
  if (requestsTotal.size === 0) {
    lines.push('app_requests_total{path="/",status="200"} 0');
  }
  for (const [key, value] of requestsTotal) {
    const [path, status] = key.split('|');
    lines.push(`app_requests_total{path="${path}",status="${status}"} ${value}`);
  }

  lines.push('# HELP app_request_duration_seconds Request latency.');
  lines.push('# TYPE app_request_duration_seconds histogram');
  for (let i = 0; i < BUCKETS.length; i++) {
    lines.push(`app_request_duration_seconds_bucket{le="${BUCKETS[i]}"} ${durationBuckets[i]}`);
  }
  lines.push(`app_request_duration_seconds_bucket{le="+Inf"} ${durationCount}`);
  lines.push(`app_request_duration_seconds_sum ${durationSum.toFixed(6)}`);
  lines.push(`app_request_duration_seconds_count ${durationCount}`);

  lines.push('# HELP app_memory_bytes Process memory, by area.');
  lines.push('# TYPE app_memory_bytes gauge');
  lines.push(`app_memory_bytes{area="rss"} ${mem.rss}`);
  lines.push(`app_memory_bytes{area="heap_used"} ${mem.heapUsed}`);
  lines.push(`app_memory_bytes{area="heap_total"} ${mem.heapTotal}`);

  lines.push('# HELP app_cpu_seconds_total Process CPU time consumed.');
  lines.push('# TYPE app_cpu_seconds_total counter');
  lines.push(`app_cpu_seconds_total{mode="user"} ${(cpu.user / 1e6).toFixed(6)}`);
  lines.push(`app_cpu_seconds_total{mode="system"} ${(cpu.system / 1e6).toFixed(6)}`);

  return lines.join('\n') + '\n';
}

// ---- handlers ---------------------------------------------------------------
const server = http.createServer((req, res) => {
  const started = process.hrtime.bigint();
  const path = (req.url || '/').split('?')[0];
  let status = 200;
  let body = '';
  let type = 'text/plain; charset=utf-8';

  if (path === '/metrics') {
    // The scrape itself is not counted - a metrics endpoint that inflates its
    // own request counter every 15 seconds makes the counter useless.
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(renderMetrics());
    return;
  }

  if (path === '/health') {
    // Liveness: is the process wedged beyond recovery? It is not enough to
    // return 200 unconditionally, but it is close - liveness failing means
    // Kubernetes KILLS the container, so it must only fail when a restart is
    // genuinely the right remedy.
    body = JSON.stringify({ status: 'ok', uptime_s: (Date.now() - START) / 1000 });
    type = 'application/json';
  } else if (path === '/ready') {
    // Readiness: can it serve traffic RIGHT NOW? Failing this removes the pod
    // from the Service's endpoints without restarting it - the correct
    // response to a slow dependency.
    status = ready ? 200 : 503;
    body = JSON.stringify({ ready });
    type = 'application/json';
  } else if (path === '/toggle-ready') {
    ready = !ready;
    body = JSON.stringify({ ready });
    type = 'application/json';
  } else if (path === '/work') {
    // Burn CPU for ~400ms so `kubectl top` and the CPU graphs have something
    // to show.
    const until = Date.now() + 400;
    let n = 0;
    while (Date.now() < until) { n += Math.sqrt(n + 1); }
    body = JSON.stringify({ worked: true, result: Math.round(n) });
    type = 'application/json';
  } else if (path === '/error') {
    status = 500;
    body = JSON.stringify({ error: 'deliberate failure, for the error-rate alert' });
    type = 'application/json';
  } else if (path === '/') {
    type = 'text/html; charset=utf-8';
    body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Session 20 monitoring demo</title></head><body>
<h1>Session 20 - monitoring demo</h1>
<p>version ${VERSION}, up ${((Date.now() - START) / 1000).toFixed(0)}s</p>
<ul>
  <li><a href="/metrics">/metrics</a> - Prometheus scrape target</li>
  <li><a href="/health">/health</a> - liveness</li>
  <li><a href="/ready">/ready</a> - readiness</li>
  <li><a href="/work">/work</a> - burns CPU</li>
  <li><a href="/error">/error</a> - returns 500</li>
</ul></body></html>`;
  } else {
    status = 404;
    body = JSON.stringify({ error: 'not found' });
    type = 'application/json';
  }

  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  recordRequest(path, status, seconds);

  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
});

server.listen(PORT, () => {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    event: 'server_started',
    port: PORT,
    version: VERSION,
  }));
});

// Structured shutdown logging, and a graceful close so in-flight requests
// finish rather than being cut off mid-response.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      event: 'shutdown',
      signal,
    }));
    server.close(() => process.exit(0));
  });
}
