# Observability — the three pillars

## Monitoring vs observability

These two words get used interchangeably and they are not the same thing.

**Monitoring** watches for failures you already thought of. You decide in
advance that CPU above 80% matters, write an alert for it, and the system tells
you when it happens. Monitoring answers **known questions**: *is it up? is it
slow? is the disk full?*

**Observability** is the property of being able to answer questions you did
**not** think of in advance, from the data the system already emits — without
shipping new code to find out.

The distinction only becomes real at a certain complexity. A single server
running one process has a small, enumerable set of failure modes; a dashboard
covers it. A system of forty services, each with its own database, cache and
queue, has a failure space nobody can enumerate. The outage you actually get is
"checkout is slow, but only for users in one region, only on mobile, only since
Tuesday" — and no pre-built dashboard has that chart on it.

> **Monitoring tells you *that* something is wrong.
> Observability is what lets you work out *why*.**

A system is observable when you can take a question you have never asked before
and answer it from existing telemetry.

---

## Why observability is required

**1. You cannot predict every failure.** Every dashboard is a list of failures
someone imagined. Real incidents are usually the interaction of two things that
were each individually fine.

**2. Distributed systems fail partially.** A monolith is up or down.
A microservice architecture is "92% up" — one service degraded, affecting one
code path, for a subset of users. Host-level metrics show nothing at all.

**3. Averages hide the problem.** A 200 ms average response time can mean
everyone gets 200 ms, or that 95% get 50 ms and 5% get 3 seconds. The second is
an incident; the average conceals it. Percentiles — p50, p95, p99 — are the
minimum, and even they only describe the shape, not the cause.

**4. Debugging in production is the only option.** You cannot attach a debugger
to a live cluster, and most serious bugs do not reproduce locally — they need
production's data volume, concurrency and traffic mix.

**5. MTTR dominates availability.** Failure is a given. What determines
availability is how fast you can find the cause. Most of an incident's duration
is spent locating the problem, not fixing it.

**6. It makes blast radius visible.** "Is this affecting everyone or one
tenant?" is usually the first question asked and often the hardest to answer
without good telemetry.

---

# The three pillars

| | Metrics | Logs | Traces |
|---|---|---|---|
| **Shape** | Numbers over time | Discrete events with text | A request's path across services |
| **Answers** | *Is something wrong?* | *What exactly happened?* | *Where did the time go?* |
| **Cost** | Cheap — aggregated | Expensive — one entry per event | Moderate — usually sampled |
| **Cardinality** | **Must stay low** | Unlimited | Unlimited |
| **Retention** | Months to years | Days to weeks | Days |
| **Good at** | Trends, alerting, SLOs | Detail, root cause, audit | Latency attribution in distributed calls |
| **Bad at** | Explaining a specific request | Aggregation at scale | Being cheap at 100% sampling |

They are complements, not alternatives. The normal debugging path runs through
all three in order:

```
  Metrics          →          Traces          →          Logs
  "p99 latency                "checkout spends           "connection pool
   doubled at 14:20"           2.8s in the                exhausted,
                               payments service"          waited 2.7s"
   something is wrong          where it is wrong          why it is wrong
```

---

## Pillar 1 — Metrics

**A metric is a number measured over time**, stored as a time series: a name, a
set of labels, and a sequence of (timestamp, value) pairs.

```
http_requests_total{method="GET", path="/api/notes", status="200"}  1  1696688400
http_requests_total{method="GET", path="/api/notes", status="200"}  1  1696688410
```

Cheap, because they aggregate. A million requests become one counter
increment, not a million rows — which is why metrics can be kept for a year
while logs cannot.

### The four metric types

| Type | Behaviour | Example |
|------|-----------|---------|
| **Counter** | Only goes up (or resets to zero on restart) | `http_requests_total` |
| **Gauge** | Goes up and down | `memory_usage_bytes`, `queue_depth` |
| **Histogram** | Buckets observations, so percentiles can be computed | `http_request_duration_seconds` |
| **Summary** | Percentiles computed client-side | rarely the right choice — cannot be aggregated across instances |

A counter never gives you a rate directly; you ask for one:
`rate(http_requests_total[5m])`. That is deliberate — a counter that resets on
restart is still correct, because `rate()` understands resets.

### Cardinality — the one way to destroy a metrics system

**Cardinality** is the number of distinct label combinations. Each one is a
separate time series stored in memory.

```promql
# fine — maybe 20 series
http_requests_total{method, path, status}

# catastrophic — one series PER USER, forever
http_requests_total{method, path, status, user_id}
```

Adding `user_id` to a metric is the single most common way to take down a
Prometheus server. User IDs, request IDs, session IDs, email addresses and full
URLs with query strings all belong in **logs or traces**, never in a metric
label. Metrics are for things with a small, bounded set of values.

### What to measure

**The RED method**, for request-driven services:

- **R**ate — requests per second
- **E**rrors — failed requests per second
- **D**uration — latency distribution

**The USE method**, for resources (CPU, memory, disk, network):

- **U**tilisation — percentage busy
- **S**aturation — queued work waiting
- **E**rrors — error count

**The four golden signals** (Google SRE) are RED plus saturation.

Saturation is the one people skip, and it is the leading indicator. CPU at 100%
with no queue is a well-used machine; CPU at 70% with a growing run queue is a
machine about to fall over.

---

## Pillar 2 — Logs

**A log is a timestamped record of a discrete event.** Where a metric says "47
requests failed", a log says *which* request, *for whom*, and *with what
error*.

### Unstructured vs structured

```
# unstructured — human-readable, machine-hostile
2026-10-07 14:23:11 ERROR Failed to charge user 1024: card declined

# structured — queryable
{"ts":"2026-10-07T14:23:11Z","level":"error","event":"charge_failed",
 "user_id":1024,"order_id":"ord_88fa","reason":"card_declined",
 "trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","service":"payments"}
```

The second can be queried: *"all `charge_failed` events for `card_declined` in
the last hour, grouped by region."* The first requires a regex that breaks the
next time someone edits the message string.

**Structured logging is the single highest-value change** you can make to a
logging setup. Everything else — aggregation, alerting, correlation — depends
on it.

### Levels, used properly

| Level | Means | Action |
|-------|-------|--------|
| `ERROR` | Something failed that should not have | Someone should look |
| `WARN` | Unexpected but handled; a retry succeeded | Watch the rate |
| `INFO` | Significant business events — order placed, user registered | Normal operation |
| `DEBUG` | Detail for diagnosis | Off in production, except when it is not |

The common failure is logging everything at `INFO` or `ERROR`, which makes
level-based alerting useless: if `ERROR` fires a hundred times an hour in
normal operation, nobody reads `ERROR`.

### The two rules that make logs worth having

**1. Never log secrets.** Passwords, tokens, API keys, full card numbers,
personal data. Logs are copied to half a dozen systems, kept for weeks and read
by people who would never be granted database access. Session 17's Gitleaks
scan exists because this rule gets broken constantly.

**2. Always include a trace ID.** Without one, correlating a user's complaint
across six services means guessing from timestamps. With one, it is a single
query. This is the field that joins the pillars together.

### Cost

Logs are the most expensive pillar by an order of magnitude — one entry per
event, with no aggregation. The usual controls are sampling high-volume success
paths while keeping 100% of errors, short hot retention with cheap cold
archive, and resisting the urge to log inside loops.

---

## Pillar 3 — Traces

**A trace follows one request through every service it touches.**

A trace is a tree of **spans**. Each span is one unit of work, with a start
time, a duration, a parent, and attributes:

```
trace_id: 4bf92f3577b34da6a3ce929d0e0e4736            total 3.1s
│
├─ [span] api-gateway        POST /checkout           3.1s
│  └─ [span] order-service   createOrder              3.0s
│     ├─ [span] inventory    checkStock              120ms
│     ├─ [span] payments     charge                  2.8s   ← the problem
│     │  └─ [span] postgres  SELECT ... FOR UPDATE   2.7s   ← the real problem
│     └─ [span] notify       sendEmail                80ms
```

That picture is the answer to "why is checkout slow?", and no amount of
per-service metrics produces it. Each service individually looks fine —
payments is "slow" only in the context of this call path.

### Context propagation

A trace works because every service passes the trace context along in its
outbound requests, as a W3C `traceparent` header:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             │  │                                │                │
             │  trace-id (whole request)         │                flags
             version                             parent span-id
```

**One service that drops the header breaks the trace from that point down.**
This is why tracing is the pillar that needs coordination: metrics and logs can
be adopted service by service, tracing cannot.

### Sampling

Tracing every request at full detail is expensive, so traces are sampled:

| Strategy | How | Trade-off |
|----------|-----|-----------|
| **Head-based** | Decide at the first service, e.g. keep 1% | Cheap; may discard the slow request you needed |
| **Tail-based** | Buffer the whole trace, then decide | Keeps every error and every slow request; needs memory and a collector |

Tail-based is what you want in practice — "keep 100% of errors and anything
over 1 second, 1% of the rest."

---

## How the pillars connect

Three pillars kept in three separate systems is three separate investigations.
They become useful when they share identifiers:

```
                    ┌──────────────┐
         alert ───▶ │   METRICS    │  p99 latency doubled at 14:20
                    └──────┬───────┘
                           │  exemplar: trace_id 4bf92f35…
                    ┌──────▼───────┐
                    │    TRACES    │  payments.charge = 2.8s of 3.1s
                    └──────┬───────┘
                           │  same trace_id
                    ┌──────▼───────┐
                    │     LOGS     │  "connection pool exhausted"
                    └──────────────┘
```

The joins that make this work:

- **Metrics → traces** via **exemplars** — a metric sample carrying a trace ID
  of a request in that bucket. Click the spike on the latency histogram, land
  on a slow trace.
- **Traces → logs** via **trace_id in every log line**.
- **Logs → metrics** via consistent labels — `service`, `env`, `version`.

Without those identifiers you have three dashboards. With them you have
observability.

---

## Common tools

### Metrics

| Tool | Notes |
|------|-------|
| **Prometheus** | The de facto standard in Kubernetes. Pull-based, PromQL, built-in alerting rules. Single-node by design |
| **Thanos / Mimir / Cortex** | Long-term storage and global query across many Prometheus servers |
| **VictoriaMetrics** | Prometheus-compatible, markedly more efficient at scale |
| **Grafana** | The visualisation layer for all of the above. Not a datastore |
| **CloudWatch / Azure Monitor** | Cloud-native; automatic for managed services, weaker for application metrics |
| **Datadog / New Relic** | Commercial, all three pillars in one product, priced per host and per GB |

### Logs

| Tool | Notes |
|------|-------|
| **Loki** | Grafana's log store. Indexes **labels only**, not log content — far cheaper than Elasticsearch, and a natural fit if you already run Prometheus |
| **Elasticsearch / OpenSearch** | Full-text indexing. Powerful, expensive to run |
| **Fluent Bit / Fluentd / Vector** | Collectors — tail files, parse, enrich, forward. Fluent Bit is the light one |
| **CloudWatch Logs** | Default sink on AWS |

### Traces

| Tool | Notes |
|------|-------|
| **OpenTelemetry** | **The standard.** Vendor-neutral SDKs, collector and wire format. Instrument once, send anywhere. Start here |
| **Jaeger** | Open-source backend and UI, CNCF |
| **Tempo** | Grafana's trace store, object-storage backed |
| **AWS X-Ray** | Native on AWS |

**OpenTelemetry is the one to learn.** It has absorbed OpenTracing and
OpenCensus, covers all three signals, and removes vendor lock-in from
instrumentation — the expensive part to change later.

---

## Kubernetes observability

Kubernetes adds a layer of its own, because the thing being observed moves.

### What is different

- **Pods are ephemeral.** A pod that crashed is gone, and its logs with it,
  unless they were shipped off the node first. The default `kubectl logs` reads
  the node's file — which the kubelet rotates and eventually deletes.
- **There are two layers to watch**: the cluster (nodes, scheduling, control
  plane) and the applications on it. Both can be unhealthy independently.
- **Everything is labelled.** Namespace, deployment, pod, container and node
  labels come for free and are what make Kubernetes telemetry queryable.
- **Health is declared, not inferred.** Probes are a first-class concept rather
  than something bolted on.

### The standard stack

```
┌────────────────────────────────────────────────────────────────────┐
│  CLUSTER                                                           │
│                                                                    │
│   ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐   │
│   │ node-exporter│   │ kube-state-      │   │  cAdvisor        │   │
│   │ (DaemonSet)  │   │ metrics          │   │  (in kubelet)    │   │
│   │ host CPU/mem │   │ object state:    │   │  container       │   │
│   │ disk/network │   │ replicas, phase  │   │  CPU/mem/IO      │   │
│   └──────┬───────┘   └────────┬─────────┘   └────────┬─────────┘   │
│          └────────────────────┼──────────────────────┘             │
│                               │ scrape                             │
│                        ┌──────▼───────┐                            │
│                        │  Prometheus  │──▶ Alertmanager ──▶ Slack  │
│                        └──────┬───────┘                            │
│                               │                                    │
│   ┌──────────────┐     ┌──────▼───────┐     ┌─────────────────┐    │
│   │  Fluent Bit  │────▶│     Loki     │     │ OTel Collector  │    │
│   │  (DaemonSet) │     │    (logs)    │     │   → Tempo       │    │
│   └──────────────┘     └──────┬───────┘     └────────┬────────┘    │
│                               │                      │             │
│                        ┌──────▼──────────────────────▼────────┐    │
│                        │             Grafana                  │    │
│                        └──────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

| Component | Provides |
|-----------|----------|
| **metrics-server** | The lightweight one. Powers `kubectl top` and the HPA. **Not a monitoring system** — it keeps ~60 seconds of data in memory and stores nothing |
| **node-exporter** | Host-level metrics from every node |
| **kube-state-metrics** | The state of Kubernetes *objects* — desired vs ready replicas, pod phase, deployment conditions. Complements cAdvisor, which only knows about containers |
| **cAdvisor** | Per-container CPU, memory, filesystem and network, built into the kubelet |
| **Prometheus Operator** | `ServiceMonitor` / `PodMonitor` CRDs, so a service declares its own scraping instead of editing central config |
| **Fluent Bit** | Tails container logs on every node and ships them before the pod disappears |
| **OpenTelemetry Collector** | Receives, processes and exports all three signals |

`kube-prometheus-stack` is the Helm chart that installs Prometheus, Grafana,
Alertmanager, node-exporter and kube-state-metrics with dashboards already
wired together. In practice almost nobody assembles these by hand.

### Health, the Kubernetes way

Kubernetes checks application health itself, through three probes — covered in
detail in Session 13, and the reason the monitoring demo in this session has
all three:

| Probe | Question | On failure |
|-------|----------|------------|
| **startup** | Has it finished booting? | Keeps the other two from firing during a slow start |
| **readiness** | Can it serve traffic *right now*? | Removed from Service endpoints — **not restarted** |
| **liveness** | Is it wedged beyond recovery? | **Container is killed and restarted** |

The distinction matters. A pod waiting on a slow dependency should fail
*readiness* — take it out of rotation and let it recover. Failing *liveness*
restarts it, which throws away in-flight work and does nothing about the
dependency. Getting these the wrong way round produces a restart loop during
every downstream outage.

### What to alert on

The temptation is to alert on causes — CPU high, memory high, a pod restarted.
That produces noise, because a restarted pod usually recovers before anyone
reads the page.

Alert on **symptoms the user can feel**:

| Good | Why |
|------|-----|
| Error rate above 1% for 5 minutes | Users are seeing failures |
| p99 latency above 1s for 10 minutes | Users are waiting |
| Available replicas below desired for 15 minutes | Capacity is gone |
| Pod in `CrashLoopBackOff` for 10 minutes | It is not recovering on its own |
| Disk will be full in 4 hours | Predictive, actionable, not yet urgent |

| Poor | Why |
|------|-----|
| CPU above 80% | Is a busy server broken? Usually not |
| A pod restarted | Kubernetes restarting a pod is the system working |
| Memory above 70% | Caches are supposed to use memory |

Every alert should be **actionable** and should name what the responder is
meant to do. An alert nobody acts on trains everyone to ignore alerts — and
that is how the one that mattered gets missed.

---

## How this connects to the rest of the course

- **Session 13** added probes and an HPA. The HPA consumes exactly the metrics
  described here — `metrics-server` is its data source, which is why the
  monitoring demo installs it.
- **Session 17** built a pipeline that refuses to ship unsafe code. Monitoring
  is the other half of that loop: the pipeline governs what goes out,
  observability tells you what happened once it did.
- **This session's GitOps demo** is observable in the same way — Argo CD
  exposes sync status and health as metrics, so "has production drifted from
  git?" becomes a graph and an alert rather than a question someone has to
  remember to ask.
