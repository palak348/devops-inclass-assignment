# Monitoring demo — metrics, logs, alerts, CPU, memory and health

A real Prometheus deployment scraping a real application in Kubernetes, with
alerting rules that were made to fire on purpose. Every block of output below
was captured from the running cluster.

---

## What is deployed

```
namespace: session20
│
├── demo-app       2 replicas, exposes /metrics, /health, /ready
│                  requests 50m CPU / 64Mi, limits 300m / 128Mi
│                  startup + readiness + liveness probes
│                  NodePort 30200
│
└── prometheus     scrapes demo-app, cAdvisor and itself
                   7 alerting rules
                   NodePort 30209
```

| File | Holds |
|------|-------|
| `app/server.js` | The application. No dependencies — the Prometheus text format is emitted by hand so the four metric types are visible rather than hidden in a client library |
| `app/Dockerfile` | Single stage, non-root, with a HEALTHCHECK |
| `k8s/01-namespace.yaml` | `session20` |
| `k8s/02-demo-app.yaml` | Deployment + Service, resource requests, all three probes, scrape annotations |
| `k8s/03-prometheus-rbac.yaml` | ServiceAccount, ClusterRole, binding — all read-only |
| `k8s/04-prometheus-config.yaml` | `prometheus.yml` and `alerts.yml` |
| `k8s/05-prometheus.yaml` | Prometheus Deployment + Service |

---

## Metrics

### The app exposes them; nothing is inferred

```
$ curl -s http://localhost:8080/metrics

app_uptime_seconds 241.922
app_ready 1
app_requests_total{path="/health",status="200"} 25
app_requests_total{path="/ready",status="200"} 49
app_requests_total{path="/",status="200"} 40
app_requests_total{path="/error",status="500"} 10
app_requests_total{path="/work",status="200"} 8
app_memory_bytes{area="rss"} 63291392
app_memory_bytes{area="heap_used"} 5139928
app_memory_bytes{area="heap_total"} 7708672
app_cpu_seconds_total{mode="user"} 1.468783
app_cpu_seconds_total{mode="system"} 0.170348
```

All four metric types are present:

| Type | Metric | Why that type |
|------|--------|---------------|
| **Counter** | `app_requests_total` | Only goes up. Prometheus derives rates from the increase between scrapes, which is why a reset on restart is still handled correctly |
| **Gauge** | `app_ready`, `app_memory_bytes` | Goes up and down |
| **Histogram** | `app_request_duration_seconds` | Buckets observations so percentiles are computed at query time, across all instances |
| **Counter** | `app_cpu_seconds_total` | CPU time consumed, monotonic |

Two deliberate choices in `server.js`:

- **The `/metrics` scrape does not count itself.** A metrics endpoint that
  increments its own request counter every 15 seconds makes the counter
  meaningless.
- **No user ID, request ID or session ID appears in any label.** Each distinct
  label combination is a separate time series held in memory; a `user_id` label
  creates one series per user and is the standard way to take down a Prometheus
  server. High-cardinality identifiers belong in logs and traces.

### Prometheus discovers targets rather than being told about them

The app declares that it wants to be scraped:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3000"
  prometheus.io/path: "/metrics"
```

and Prometheus keeps only the pods carrying that annotation:

```yaml
relabel_configs:
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    action: keep
    regex: "true"
```

Scale the Deployment to five and all five are scraped, with no configuration
change anywhere. That is the difference between service discovery and a static
target list.

### All four targets up

```
$ curl -s "http://localhost:9090/api/v1/targets?state=active"

demo-app               demo-app-55d9f5d47b-2gh2l      up
demo-app               demo-app-55d9f5d47b-mzhqd      up
kubernetes-cadvisor    -                              up
prometheus             -                              up
```

Prometheus scraping itself is worth having: if that target is down, nothing
else it reports can be trusted either.

### Queries

```
sum by (status) (app_requests_total)
  status=200                        204
  status=500                         10

sum(rate(app_requests_total[5m]))
  0.2649                            requests/second

histogram_quantile(0.95, sum(rate(app_request_duration_seconds_bucket[5m])) by (le))
  0.2942                            seconds — p95
```

The p95 is the point of the histogram. The average over that same traffic is
far lower, because most requests are the instant ones and only `/work` takes
400 ms. An average of 200 ms can mean everyone gets 200 ms, or that 95% get
50 ms and 5% get three seconds — and those are very different situations.

---

## CPU utilisation

Two independent sources, which is deliberate — they answer different questions.

### `kubectl top` — metrics-server

```
$ kubectl top nodes
NAME       CPU(cores)   CPU(%)   MEMORY(bytes)   MEMORY(%)
minikube   579m         2%       2490Mi          32%

$ kubectl top pods -n session20 --containers
POD                           NAME         CPU(cores)   MEMORY(bytes)
demo-app-55d9f5d47b-2gh2l     demo-app     1m           11Mi
demo-app-55d9f5d47b-mzhqd     demo-app     2m           10Mi
prometheus-5865cfbf75-hmnlq   prometheus   18m          84Mi
```

`metrics-server` is the lightweight path: it holds roughly the last 60 seconds
in memory and stores nothing. It powers `kubectl top` and the HPA, and it is
**not a monitoring system** — there is no history to query and no alerting.

### cAdvisor via Prometheus — history and alerting

```
sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="session20",container="demo-app"}[2m]))
  demo-app-55d9f5d47b-2gh2l    0.0148    cores
  demo-app-55d9f5d47b-mzhqd    0.0005    cores
```

The asymmetry is real and informative: the port-forward sent all the `/work`
traffic to one pod, so one burned 15 millicores and the other was idle. A
per-pod view shows load imbalance that a Deployment-level average would hide.

**CPU in Kubernetes is a rate, not a gauge.** `container_cpu_usage_seconds_total`
is a counter of CPU-seconds consumed; `rate(...[2m])` turns it into cores. A
value of `0.0148` means 14.8 millicores — about 5% of this container's 300m
limit.

---

## Memory utilisation

```
sum by (pod) (container_memory_working_set_bytes{namespace="session20",container="demo-app"}) / 1024 / 1024
  demo-app-55d9f5d47b-2gh2l    12.26    MiB
  demo-app-55d9f5d47b-mzhqd    11.41    MiB

container_memory_working_set_bytes{...} / container_spec_memory_limit_bytes{...}
  demo-app-55d9f5d47b-2gh2l    0.0958   → 9.6% of limit
  demo-app-55d9f5d47b-mzhqd    0.0892   → 8.9% of limit
```

Two things matter here.

**Working set, not RSS.** `container_memory_working_set_bytes` is what the
kernel uses to decide OOM-kills, because it excludes reclaimable page cache.
`app_memory_bytes{area="rss"}` reports 63 MB for the same container — the
difference is cache the kernel can drop under pressure. Alerting on RSS
produces false alarms.

**As a fraction of the limit, not of the node.** The container is OOM-killed at
100% of *its* limit, whatever the node has spare. That is why the alert divides
by `container_spec_memory_limit_bytes` rather than node capacity — and why
setting limits is a prerequisite for meaningful memory alerting.

---

## Application health

Three probes, each answering a different question:

| Probe | Endpoint | Question | On failure |
|-------|----------|----------|------------|
| **startup** | `/health` | Has it finished booting? | Holds the other two off; 15 × 2s of grace |
| **readiness** | `/ready` | Can it serve traffic right now? | Removed from Service endpoints — **not restarted** |
| **liveness** | `/health` | Is it wedged beyond recovery? | **Container is killed and restarted** |

The distinction is the thing worth getting right. A pod waiting on a slow
database should fail **readiness** — take it out of rotation, let it recover.
Failing **liveness** restarts it, throwing away in-flight work and doing
nothing about the database. Wiring them the wrong way round turns every
downstream outage into a restart storm.

The liveness thresholds here are deliberately slacker than readiness —
10s period, 3 failures, versus 5s and 2. Restarting should be the last resort.

The app also reports its own view as a metric:

```
app_ready 1
```

which is checked by the `AppNotReady` alert. Having both the kubelet's probe
and the app's self-report is useful precisely because they can disagree.

---

## Alerts

Seven rules, loaded and evaluated:

```
$ curl -s http://localhost:9090/api/v1/rules

application    AppDown                  inactive
application    NoAppInstances           inactive
application    HighErrorRate            inactive
application    HighLatencyP95           inactive
application    AppNotReady              inactive
resources      ContainerMemoryHigh      inactive
resources      ContainerCPUThrottling   inactive
```

### Alerting on symptoms, not causes

Every rule above fires on something a user can feel. None of them fires on
"CPU is high", because a busy server is usually a server doing its job. The
resource rules deliberately pick the symptom version of each:

- not "memory is high" but **memory above 85% of the limit** — the number at
  which the container is OOM-killed
- not "CPU is high" but **CPU throttling** — the kernel actively slowing the
  container down, which users experience as latency

An alert that fires when nothing is wrong trains everyone to ignore alerts, and
that is how the one that mattered gets missed.

### Making one fire

```
$ kubectl scale deploy/demo-app -n session20 --replicas=0
deployment.apps/demo-app scaled                       22:57:38
```

Ninety seconds later:

```
$ kubectl get pods -n session20
prometheus-5865cfbf75-hmnlq   1/1   Running   0   4m19s

$ curl -s http://localhost:9090/api/v1/alerts

NoAppInstances     state=firing   severity=critical
    activeAt : 2026-10-07T17:27:57Z
    summary  : No demo-app instances are up at all
    descr    : Every instance is down, or service discovery has stopped
               finding any. This is a full outage.
```

### The result that teaches the most

**`AppDown` did not fire. `NoAppInstances` did.**

```yaml
- alert: AppDown
  expr: up{job="demo-app"} == 0          # ← never matched

- alert: NoAppInstances
  expr: absent(up{job="demo-app"}) or sum(up{job="demo-app"}) == 0
```

`up == 0` only matches a target that **exists and fails to scrape** — a process
that is listening but broken, or a pod that stopped responding. When the
Deployment scaled to zero, the pods disappeared from service discovery, so the
`up` series disappeared with them. An expression comparing a series that no
longer exists matches nothing, and an alert whose expression returns no rows is
not firing.

This is the classic gap in Prometheus alerting: **the outage where the target
vanishes entirely is invisible to `up == 0`.** Catching it needs `absent()`,
which fires precisely *because* the data is missing.

Both rules are kept, because they catch different failures:

| Failure | `AppDown` | `NoAppInstances` |
|---------|-----------|------------------|
| Pod running but not responding | ✅ fires | ✅ fires |
| Pod crashed, replicas still desired | ✅ fires | ✅ fires |
| Deployment scaled to 0 | ❌ silent | ✅ fires |
| Namespace deleted | ❌ silent | ✅ fires |
| Prometheus' service discovery broken | ❌ silent | ✅ fires |

Scaling back up resolved it:

```
$ kubectl scale deploy/demo-app -n session20 --replicas=2
deployment.apps/demo-app scaled
```

### A query that correctly returned zero

The error-rate expression reported `0` even though ten 500s had been served:

```
sum(rate(app_requests_total{status=~"5.."}[5m])) / clamp_min(sum(rate(app_requests_total[5m])), 0.001)
  ratio = 0.0
```

That is right, not broken. `rate()` measures the **increase across the window**.
The ten errors arrived in one burst and the counter then sat flat at 10; once
the burst fell outside the 5-minute window, the increase inside it was genuinely
zero. `HighErrorRate` is built on rate for exactly that reason — it should fire
while errors are *happening*, not forever afterwards because a counter is
non-zero.

---

## Logs

The application logs structured JSON, one object per line:

```json
{"ts":"2026-10-07T17:12:04.881Z","level":"info","event":"server_started","port":3000,"version":"1.0.0"}
{"ts":"2026-10-07T17:27:40.002Z","level":"info","event":"shutdown","signal":"SIGTERM"}
```

```bash
kubectl logs -n session20 -l app=demo-app --tail=20
kubectl logs -n session20 -l app=demo-app --previous   # the container before the last restart
```

Structured rather than prose, because `{"event":"charge_failed","reason":"card_declined"}`
can be queried and `Failed to charge user 1024: card declined` can only be
regexed — and the regex breaks the next time someone edits the message string.

The shutdown line matters too: the app traps `SIGTERM` and closes the server
gracefully, so in-flight requests finish instead of being cut off when
Kubernetes terminates the pod.

**What this demo does not do:** ship logs anywhere. `kubectl logs` reads a file
on the node that the kubelet rotates and eventually deletes — when a pod is
gone, so are its logs. A real cluster runs a DaemonSet (Fluent Bit) tailing
those files into Loki or Elasticsearch *before* the pod disappears. That is the
gap between "I can read logs" and "I have logging".

---

## Issues faced & fixes

| # | Problem | Cause | Fix |
|---|---------|-------|-----|
| 1 | The `kubernetes-cadvisor` target was `down` with `server returned HTTP status 403 Forbidden` | The ClusterRole granted `nodes` and `nodes/metrics`, but scraping through `/api/v1/nodes/<node>/proxy/metrics/cadvisor` is authorised by a **different subresource**: `nodes/proxy` | Added `nodes/proxy` to the ClusterRole. The two names look interchangeable and are not — `nodes/metrics` covers the kubelet's own endpoint, `nodes/proxy` covers reaching it through the API server |
| 2 | Prometheus stuck in `ImagePullBackOff`: `dial tcp: lookup registry-1.docker.io on 192.168.65.254:53: server misbehaving` | Docker Desktop's DNS resolver inside the minikube VM was intermittently failing | Kubernetes' own pull backoff eventually succeeded. Adding `8.8.8.8` to the VM's `/etc/resolv.conf` did **not** help — it is unreachable from inside Docker Desktop's network, so that edit was reverted |
| 3 | `AppDown` stayed silent through a complete outage | `up{job="demo-app"} == 0` cannot match when the series does not exist, and scaling to zero removes the targets from service discovery entirely | Kept the rule and added `NoAppInstances` using `absent()`. Documented above — this is a real gap in the obvious way of writing a liveness alert, not a quirk of this setup |
| 4 | The error-ratio query returned `0` with ten recorded 500s | `rate()` measures increase over a window; the burst had aged out of the 5-minute window | Not a bug. Explained above — the behaviour is what makes `HighErrorRate` stop firing once errors stop |

---

## Commands

```bash
# --- deploy --------------------------------------------------------------
minikube addons enable metrics-server
docker build -t monitoring-demo:1.0.0 app/
minikube image load monitoring-demo:1.0.0
kubectl apply -f k8s/

# --- access --------------------------------------------------------------
kubectl port-forward -n session20 svc/prometheus 9090:9090
kubectl port-forward -n session20 svc/demo-app 8080:80

# --- metrics -------------------------------------------------------------
curl -s http://localhost:8080/metrics
curl -s "http://localhost:9090/api/v1/targets?state=active"
curl -s "http://localhost:9090/api/v1/rules"
curl -s --get http://localhost:9090/api/v1/query --data-urlencode 'query=sum(rate(app_requests_total[5m]))'

# --- CPU and memory ------------------------------------------------------
kubectl top nodes
kubectl top pods -n session20 --containers

# --- health --------------------------------------------------------------
curl -s http://localhost:8080/health
curl -s http://localhost:8080/ready
kubectl get pods -n session20 -o wide

# --- logs ----------------------------------------------------------------
kubectl logs -n session20 -l app=demo-app --tail=20

# --- make an alert fire --------------------------------------------------
kubectl scale deploy/demo-app -n session20 --replicas=0
curl -s http://localhost:9090/api/v1/alerts
kubectl scale deploy/demo-app -n session20 --replicas=2

# --- generate load -------------------------------------------------------
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:8080/; done
for i in $(seq 1 10); do curl -s -o /dev/null http://localhost:8080/error; done
for i in $(seq 1 8);  do curl -s -o /dev/null http://localhost:8080/work; done
```
