# CareSlot — Clinic Appointment System

Session 21 DevOps capstone · **Palak Agrawal** (24BCS10504) · repository overview and
known limitations: [root README](../../README.md) · evidence: [`docs/EVIDENCE.md`](docs/EVIDENCE.md)

CareSlot is a small clinic front-desk application. Reception staff register
**patients**, manage the **doctor** roster, and **book appointments** that move through
`SCHEDULED → CHECKED_IN → COMPLETED` (or `CANCELLED`). The API refuses to double-book a
doctor or a patient for overlapping time slots, and the dashboard shows today's load,
waiting patients, completed visits and the busiest doctor.

The point of the project is the journey of that application from a laptop to a
monitored, autoscaling Kubernetes deployment on AWS:

```text
Developer ──► Git / GitHub ──► GitHub Actions
                                 ├─ ruff + pytest (gate) + Alembic on real Postgres
                                 ├─ React build
                                 ├─ docker build backend + frontend
                                 ├─ Trivy scan (fail on any HIGH/CRITICAL)
                                 └─ push to GHCR, tag = commit SHA
                                            │
                     Terraform ──► AWS VPC (2 public + 2 private subnets) + EKS
                                            │
                                   Helm ──► namespace "careslot"
                                            ├─ Ingress  /      → frontend (React on Nginx) ×2
                                            │           /api   → backend  (FastAPI)       ×2..6 (HPA)
                                            ├─ PostgreSQL StatefulSet + PVC
                                            └─ ServiceMonitor ──► Prometheus ──► Grafana
```

---

## Contents

1. [Application](#1-application) · 2. [Repository layout](#2-repository-layout) ·
3. [Run locally](#3-run-locally) · 4. [Tests](#4-tests) · 5. [Docker](#5-docker) ·
6. [CI/CD](#6-cicd--github-actions) · 7. [Security scanning](#7-security--trivy) ·
8. [Terraform](#8-terraform--aws) · 9. [Kubernetes + Helm](#9-kubernetes--helm) ·
10. [Monitoring](#10-monitoring) · 11. [Troubleshooting](#11-troubleshooting) ·
12. [Rubric map](#12-rubric-map)

---

## 1. Application

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8, plain CSS, responsive (sidebar collapses, tables become cards on phones) |
| Backend | FastAPI, SQLAlchemy 2, Pydantic validation, Prometheus instrumentator |
| Database | PostgreSQL 16, schema managed by **Alembic** migrations |
| Serving | Nginx (non-root) serves the React build and proxies `/api` to FastAPI |

### Data model

```text
doctors (id, name, specialty, room, active)
patients (id, name, phone, email, date_of_birth)
appointments (id, doctor_id → doctors, patient_id → patients, scheduled_at,
              duration_min, reason, status, created_at)
```

Migrations: `backend/alembic/versions/0001_initial_schema.py` (tables, indexes, check
constraints) and `0002_seed_doctors.py` (four starting doctors). `alembic/env.py` takes a
PostgreSQL advisory lock so several backend replicas starting at once never run
migrations concurrently.

### REST API

Interactive docs: **`/docs`** (Swagger UI).

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness — process is up (no DB call) |
| GET | `/ready` | Readiness — `SELECT 1` against PostgreSQL, `503` if unreachable |
| GET | `/metrics` | Prometheus metrics |
| GET / POST | `/api/doctors` | List (`?active=true`) / create doctors |
| GET / PUT / DELETE | `/api/doctors/{id}` | Read / update / remove a doctor |
| GET / POST | `/api/patients` | List (`?search=`) / register patients |
| GET / PUT / DELETE | `/api/patients/{id}` | Read / update / remove a patient |
| GET / POST | `/api/appointments` | List (`?doctor_id=&patient_id=&status=&on_date=&upcoming=true`) / book |
| GET / PUT / DELETE | `/api/appointments/{id}` | Read / reschedule / delete |
| PATCH | `/api/appointments/{id}/status` | Check in, complete, cancel |
| GET | `/api/stats` | Dashboard numbers (today, upcoming, waiting, available doctors, busiest doctor) |

**Booking rules** (enforced by the API, mirrored in the UI):

| Rule | Response |
|---|---|
| Unknown doctor / patient / appointment | `404` |
| Booking or rescheduling into the past (5-minute grace) | `400` |
| Doctor marked unavailable | `400` |
| Doctor **or patient** already has an overlapping active appointment | `409` |
| Status moves only `SCHEDULED → CHECKED_IN → COMPLETED` (or `→ CANCELLED`); finished visits are final and cannot be edited | `409` |
| Status changes only via `PATCH …/status` — `PUT` with `status` (or any unknown field) is rejected | `422` |
| Phone must be exactly 10 digits; names are trimmed and cannot be blank; date of birth cannot be in the future; duration 5–240 min | `422` |

Timestamps are stored in UTC; "today" and the `on_date` filter use the clinic's local day
(`CLINIC_TIMEZONE`, default `Asia/Kolkata`), so a 01:30 IST visit counts as that day, not the previous UTC day.

---

## 2. Repository layout

```text
Final-Project/
├── backend/            FastAPI app (app/), Alembic (alembic/), pytest (tests/), Dockerfile
├── frontend/           React app (src/), Nginx template (nginx/), multi-stage Dockerfile
├── docker-compose.yml  postgres + backend + frontend
├── helm/careslot/      Helm chart (+ values-minikube.yaml, values-eks.yaml = GitOps desired state, Grafana dashboard)
├── argocd/             Argo CD install values + the CareSlot Application (GitOps)
├── k8s/                namespace.yaml (bootstrap)
├── monitoring/         kube-prometheus-stack values: prometheus-values.yaml, grafana-values.yaml
├── terraform/          AWS VPC + EKS
├── troubleshooting/    broken-image.yaml, broken-service.yaml + walkthrough
├── scripts/            smoke-test.sh (end-to-end API checks), load-test.sh (HPA demo)
└── docs/               EVIDENCE.md (rubric → screenshot index), TRIVY.md, screenshots/

../../.github/workflows/final-project.yml   CI/CD (GitHub only runs workflows from the repo root)
```

---

## 3. Run locally

### Docker Compose (whole stack)

```bash
cp .env.example .env          # then put a real password in .env (git-ignored)
docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:3000 | CareSlot UI |
| http://localhost:8000/docs | Swagger |
| http://localhost:8000/health · /ready · /metrics | Probes and metrics |

```bash
bash scripts/smoke-test.sh     # 15 end-to-end checks through the frontend's /api proxy
docker compose down            # stop  (add -v to delete the database volume)
```

### Backend only

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
export DATABASE_URL='postgresql+psycopg://careslot:<password>@localhost:5432/careslot'
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend only

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173, /api is proxied to localhost:8000
```

---

## 4. Tests

```bash
cd backend
pytest -v          # 45 tests
ruff check . && ruff format --check .
```

- `tests/conftest.py` gives every test a **fresh in-memory SQLite database** and injects it
  through FastAPI's `dependency_overrides[get_db]`, so tests never touch the real
  PostgreSQL database.
- Coverage: health/ready/metrics, doctor CRUD + validation, patient CRUD + search +
  validation, appointment booking, double-booking `409`, back-to-back slots, cancelled-slot
  rebooking, status workflow, filters, reschedule, delete, stats.
- CI additionally runs `alembic upgrade head → downgrade base → upgrade head` against a
  real PostgreSQL service container.

Tests run **before** any image is built: bad code → pytest fails → pipeline stops → no
broken image reaches the registry.

---

## 5. Docker

| Image | Build | Runs as |
|---|---|---|
| `backend/Dockerfile` | `python:3.12-alpine`, `apk upgrade`, deps installed from prebuilt wheels then **pip removed** from the image, healthcheck on `/health`, CMD runs `alembic upgrade head` then `uvicorn` | uid **10001** (`appuser`) |
| `frontend/Dockerfile` | **multi-stage**: `node:22-alpine` runs `npm ci && npm run build` → only `dist/` is copied into `nginxinc/nginx-unprivileged:1.30-alpine` (+ `apk upgrade`) | uid **101** (`nginx`), port 8080 |

Both images report **0 vulnerabilities of any severity** in Trivy (how each finding was
removed: [`docs/TRIVY.md`](docs/TRIVY.md)).

The frontend Nginx config is a template: `BACKEND_URL` is filled in at container start
(`http://backend:8000` in Compose, `http://careslot-backend:8000` in Kubernetes).
Compose starts services in order using health checks: postgres healthy → backend healthy → frontend.

---

## 6. CI/CD — GitHub Actions

Workflow: [`.github/workflows/final-project.yml`](../../.github/workflows/final-project.yml).
Triggers on **push to `main`** (and PRs) when anything under `Final-Project/` changes.

| Job | Steps |
|---|---|
| **1. Test** | setup Python 3.12 → `ruff` → **`pytest -v`** (fails the build) → Alembic on PostgreSQL → setup Node 22 → **`npm ci && npm run build`** |
| **2. Build, scan, push** | `docker build` backend + frontend → **Trivy** on both → login to GHCR → **push** |
| **3. GitOps deploy** | commits the new commit SHA into `helm/careslot/values-eks.yaml` (`github-actions[bot]`) → **Argo CD** on EKS syncs that commit → when the cluster is running, the job refreshes Argo CD and waits for **Synced + Healthy** on the new revision, then shows the rollout. CI never runs `helm` against EKS. |

Images: `ghcr.io/palak348/devops-inclass-assignment/careslot-backend:<commit SHA>` and
`.../careslot-frontend:<commit SHA>` — never `latest`, so every running Pod traces back to
one commit (`commit A → image A → Pod A`).

---

## 7. Security — Trivy

Each image is scanned for vulnerabilities and embedded secrets **before** it is pushed.
`severity: HIGH,CRITICAL` + `exit-code: 1` fails the pipeline on **any** HIGH or CRITICAL
CVE - including ones without a patch yet (no `ignore-unfixed`). Findings, the CVE explained
(CVE-2026-85091 in zlib) and how each one was removed: [`docs/TRIVY.md`](docs/TRIVY.md).

**Secret scanning of the whole git history.** `gitleaks git` over every commit of this
repository reports **no leaks** using the repo-root [`.gitleaks.toml`](../../.gitleaks.toml).
That file keeps all ~170 default rules and allowlists exactly five strings in two *earlier
session* write-ups (`DevSecOps/readme.md`, `Kubernetes Ingress, ConfigMaps & Secrets/readme.md`)
that are deliberately fake teaching examples (`sk-live-abcdef0123456789`, a base64-encoded demo
Secret, a placeholder `Authorization` header). No real credential has ever been committed;
AWS keys live only in `aws configure` and in GitHub Actions secrets.

Container scanning is one layer of several: SAST (code), dependency scanning (`npm audit`,
pip), secret scanning (Trivy `secret` scanner / gitleaks), container scanning (Trivy),
runtime hardening (non-root, dropped capabilities, read-only root FS, Pod Security
`restricted`).

---

## 8. Terraform — AWS

`terraform/` creates, in `ap-south-1`: a VPC with **2 public + 2 private subnets**, an
internet gateway and one NAT gateway, and an **EKS 1.36 cluster** with a managed node group
(2 × m7i-flex.large, Free-plan eligible) and the EBS CSI add-on. No credentials are in the code; `terraform.tfvars.example`
documents the variables. Full guide, cost table and the clean destroy order:
[`terraform/README.md`](terraform/README.md).

```bash
cd terraform
terraform init && terraform plan -out tfplan && terraform apply tfplan
aws eks update-kubeconfig --region ap-south-1 --name careslot-eks
# ... demo ...
terraform destroy      # after removing the ingress load balancer - see terraform/README.md
```

---

## 9. Kubernetes + Helm

Chart: `helm/careslot` (`Chart.yaml`, `values.yaml`, `templates/`).

| Object | Details |
|---|---|
| Namespace | `k8s/namespace.yaml` — `careslot`, Pod Security **restricted** enforced |
| Deployments | backend ×2 (HPA 2–6), frontend ×2; rolling updates with `maxUnavailable: 0` |
| Probes | backend: startup + liveness `/health`, readiness `/ready`; frontend: `/healthz`; init container waits for PostgreSQL |
| Services | ClusterIP `careslot-backend:8000`, `careslot-frontend:8080`, `careslot-postgres:5432` |
| PostgreSQL | StatefulSet + PVC; password generated by Helm on first install and kept on upgrades, or taken from a pre-created Secret (`postgres.existingSecret`, used by Argo CD on EKS) |
| Ingress | class `nginx`: `/api` → backend, `/` → frontend |
| HPA | backend, CPU target 60 % of requests, min 2 / max 6 |
| Monitoring | ServiceMonitor + Grafana dashboard ConfigMap |

### On minikube

```bash
minikube start
minikube addons enable ingress
minikube addons enable metrics-server

# monitoring first (provides the ServiceMonitor CRD) - see monitoring/README.md
# then the app, with locally built images:
docker build -t careslot-backend:local backend   && minikube image load careslot-backend:local
docker build -t careslot-frontend:local frontend && minikube image load careslot-frontend:local
kubectl apply -f k8s/namespace.yaml
helm upgrade --install careslot helm/careslot -n careslot -f helm/careslot/values-minikube.yaml --wait

kubectl get pods,svc,ingress,hpa -n careslot
helm list -n careslot
```

Open **http://careslot.local**: add `127.0.0.1 careslot.local` to
`C:\Windows\System32\drivers\etc\hosts` and keep `minikube tunnel` running in an
Administrator terminal. To test the Ingress without the hosts entry:

```bash
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 18080:80
HOST_HEADER=careslot.local bash scripts/smoke-test.sh http://localhost:18080
```

### On EKS (after `terraform apply`)

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx --version 4.15.1 -n ingress-nginx --create-namespace
helm upgrade --install metrics-server metrics-server/metrics-server --version 3.14.0 -n kube-system
# monitoring stack: monitoring/README.md
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/storageclass-gp3.yaml     # EBS gp3 disk for PostgreSQL
# GitOps: database Secret + Argo CD + the Application - exact commands in argocd/README.md
# then every git push deploys itself: CI commits the SHA, Argo CD syncs it
```

### HPA demo

```bash
kubectl get hpa -n careslot -w          # terminal 1
bash scripts/load-test.sh 180 30        # terminal 2
```

Measured on minikube: CPU rose to **182 % / 60 %** and the HPA scaled the backend from
**2 → 6** Pods, then back to 2 after the load stopped.

---

## 10. Monitoring

Prometheus scrapes `/metrics` from every backend Pod through the ServiceMonitor; Grafana
loads the **"CareSlot - API Overview"** dashboard (requests/s, p95 latency, 5xx error rate,
live backend Pod count, per-Pod CPU). Install and access: [`monitoring/README.md`](monitoring/README.md).

---

## 11. Troubleshooting

`troubleshooting/broken-image.yaml` (ImagePullBackOff) and
`troubleshooting/broken-service.yaml` (Service selector matches no Pods) — symptoms,
commands, root cause and fix from a real run: [`troubleshooting/README.md`](troubleshooting/README.md).

---

## 12. Rubric map

| Module | Where |
|---|---|
| M1 Application | `backend/app/`, `backend/alembic/versions/`, `frontend/`, `docker-compose.yml` |
| M2 Testing | `backend/tests/` (45 tests), `backend/pytest.ini`, `backend/tests/conftest.py` |
| M3 Git | commit history, `.gitignore` (`.env`, `__pycache__`, `node_modules`, `.venv`) |
| M4 Docker | `backend/Dockerfile`, `frontend/Dockerfile` (multi-stage, non-root), `docker-compose.yml` |
| M5 CI/CD | `.github/workflows/final-project.yml` |
| M6 DevSecOps | Trivy steps in the workflow, `docs/TRIVY.md` |
| M7 Terraform | `terraform/` |
| M8 Kubernetes + Helm | `k8s/namespace.yaml`, `helm/careslot/`, `argocd/` (GitOps on EKS) |
| M9 Observability | `/metrics`, `monitoring/`, ServiceMonitor + dashboard in the chart |
| M10 Documentation | repository-root `README.md` (full technical documentation incl. known issues), this README, `demo/` (slide deck PPTX + PDF) |
