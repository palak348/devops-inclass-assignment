# Monitoring — Prometheus + Grafana

```text
FastAPI /metrics  ◄── scraped every 15s ──  Prometheus  ◄── queries ──  Grafana dashboard
     ▲                                          ▲
  backend Service (port "http")        ServiceMonitor (helm/careslot/templates/servicemonitor.yaml)
```

- The backend exposes Prometheus metrics on **`/metrics`** using
  `prometheus-fastapi-instrumentator`: `http_requests_total{handler,method,status}`,
  `http_request_duration_seconds_bucket{handler,method,le}`, request/response sizes.
- **kube-prometheus-stack** (chart `92.8.0`) installs the Prometheus Operator, Prometheus,
  Grafana, kube-state-metrics and node-exporter.
- The CareSlot chart ships a **ServiceMonitor** (tells Prometheus what to scrape) and a
  **Grafana dashboard ConfigMap** (`grafana_dashboard: "1"`), loaded by Grafana's sidecar.

| File | Purpose |
|---|---|
| `prometheus-values.yaml` | Scrape ServiceMonitors from all namespaces, 2-day retention, Alertmanager off |
| `grafana-values.yaml` | Admin login from the `grafana-admin` Secret, dashboard sidecar watching all namespaces |
| `../helm/careslot/dashboards/careslot-overview.json` | The "CareSlot - API Overview" dashboard (req/s, p95 latency, 5xx rate, backend pods, CPU) |

## Install

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

kubectl create namespace monitoring
# Grafana admin password lives only in the cluster, never in Git:
kubectl create secret generic grafana-admin -n monitoring \
  --from-literal=admin-user=admin \
  --from-literal=admin-password="$(openssl rand -base64 18)"

helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --version 92.8.0 -n monitoring \
  -f monitoring/prometheus-values.yaml \
  -f monitoring/grafana-values.yaml
```

Install the monitoring stack **before** the CareSlot chart: the chart only renders its
ServiceMonitor when the `monitoring.coreos.com/v1` CRD exists.

## Look at it

```bash
# raw metrics straight from the backend
kubectl port-forward -n careslot svc/careslot-backend 8000:8000
curl http://localhost:8000/metrics

# Prometheus -> Status -> Targets: "serviceMonitor/careslot/careslot-backend/0" should be UP
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
# open http://localhost:9090/targets

# Grafana -> Dashboards -> "CareSlot - API Overview"
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
# open http://localhost:3001  (user: admin, password below)
kubectl get secret grafana-admin -n monitoring -o jsonpath="{.data.admin-password}" | base64 -d
```

Panels only move when there is traffic — run `scripts/smoke-test.sh` or
`scripts/load-test.sh` while watching.
