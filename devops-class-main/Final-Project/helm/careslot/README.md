# Helm chart `careslot`

Deploys the whole application into one namespace.

| Template | Creates |
|---|---|
| `backend.yaml` | Deployment (init container waits for PostgreSQL, startup/liveness/readiness probes on `/health` and `/ready`, read-only root FS), ClusterIP Service `:8000`, HPA 2-6 on CPU 60 % |
| `frontend.yaml` | Deployment ×2 (probe `/healthz`), ClusterIP Service `:8080` |
| `postgres.yaml` | Secret (unless `existingSecret`), ClusterIP Service `:5432`, StatefulSet with a PVC |
| `ingress.yaml` | Ingress class `nginx`: `/api` → backend, `/` → frontend |
| `servicemonitor.yaml` | Prometheus ServiceMonitor for `/metrics` (only if the Prometheus Operator CRD exists) |
| `grafana-dashboard.yaml` | ConfigMap with `dashboards/careslot-overview.json` for Grafana's sidecar |

All Pods run as non-root with capabilities dropped (passes Pod Security `restricted`).

## Values files

| File | Used for |
|---|---|
| `values.yaml` | defaults: GHCR images, 2 replicas, HPA on, Ingress host `careslot.local`, monitoring on |
| `values-minikube.yaml` | local images `careslot-*:local`, `pullPolicy: Never` |
| `values-eks.yaml` | **GitOps desired state** read by Argo CD: image tags (rewritten by CI to the commit SHA), `postgres.existingSecret`, gp3 storage, any Ingress host |

Key options: `backend.image.tag`, `frontend.image.tag`, `backend.autoscaling.*`,
`postgres.existingSecret`, `postgres.storage.storageClass`, `ingress.host`,
`monitoring.serviceMonitor.enabled`.

## Install

```bash
# minikube (plain Helm)
helm upgrade --install careslot helm/careslot -n careslot -f helm/careslot/values-minikube.yaml --wait

# EKS: not installed with helm - Argo CD renders this chart from Git (see argocd/README.md)

helm lint helm/careslot -f helm/careslot/values-eks.yaml
```

Without `existingSecret`, the chart generates a random database password on the first install
and keeps it on upgrades (`lookup`). Argo CD renders charts without `lookup`, so GitOps installs
pass a pre-created Secret instead.
