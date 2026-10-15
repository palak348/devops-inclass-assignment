# CareSlot — Clinic Appointment System (DevOps Final Project)

**Palak Agrawal** · 24BCS10504 · Session 21 capstone

CareSlot is a small clinic front-desk application. Reception staff register
**patients**, manage the **doctor** roster, and **book appointments** that move through
`SCHEDULED → CHECKED_IN → COMPLETED` (or `CANCELLED`). The API refuses to double-book a
doctor for overlapping time slots, and the dashboard shows today's load, waiting
patients, completed visits and the busiest doctor.

The point of the project is the journey of that application from a laptop to a
monitored, autoscaling Kubernetes deployment on AWS:

```text
Developer ──► Git / GitHub ──► GitHub Actions
                                 ├─ ruff + pytest (gate) + Alembic on real Postgres
                                 ├─ React build
                                 ├─ docker build backend + frontend
                                 ├─ Trivy scan (fail on fixable HIGH/CRITICAL)
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
12. [Demo script](#12-final-demo-script) · 13. [Rubric map](#13-rubric-map)

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
| GET / POST | `/api/appointments` | List (`?doctor_id=&patient_id=&status=&on_date=`) / book |
| GET / PUT / DELETE | `/api/appointments/{id}` | Read / reschedule / delete |
| PATCH | `/api/appointments/{id}/status` | Check in, complete, cancel |
| GET | `/api/stats` | Dashboard numbers |

Business rules: `404` for unknown IDs, `409` when a doctor is already booked for an
overlapping slot or a finished visit is reopened, `400` for booking an unavailable doctor,
`422` for invalid input (bad phone/email, too-short names, durations outside 5–240 min).

---

## 2. Repository layout

```text
Final-Project/
├── backend/            FastAPI app (app/), Alembic (alembic/), pytest (tests/), Dockerfile
├── frontend/           React app (src/), Nginx template (nginx/), multi-stage Dockerfile
├── docker-compose.yml  postgres + backend + frontend
├── helm/careslot/      Helm chart (+ values-minikube.yaml, values-eks.yaml, Grafana dashboard)
├── k8s/                namespace.yaml (bootstrap)
├── monitoring/         kube-prometheus-stack values: prometheus-values.yaml, grafana-values.yaml
├── terraform/          AWS VPC + EKS
├── troubleshooting/    broken-image.yaml, broken-service.yaml + walkthrough
├── scripts/            smoke-test.sh (end-to-end API checks), load-test.sh (HPA demo)
└── docs/               TRIVY.md, SCREENSHOTS.md, screenshots/

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
pytest -v          # 25 tests
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
| `backend/Dockerfile` | `python:3.12-slim`, deps layer cached, healthcheck on `/health`, CMD runs `alembic upgrade head` then `uvicorn` | uid **10001** (`appuser`) |
| `frontend/Dockerfile` | **multi-stage**: `node:22-alpine` runs `npm ci && npm run build` → only `dist/` is copied into `nginxinc/nginx-unprivileged:1.30-alpine` | uid **101** (`nginx`), port 8080 |

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
| **3. Deploy** | AWS credentials → `aws eks update-kubeconfig` → **`helm upgrade --install`** with the new tag → shows the rollout. Skips itself until the AWS secrets exist. |

Images: `ghcr.io/palak348/devops-inclass-assignment/careslot-backend:<commit SHA>` and
`.../careslot-frontend:<commit SHA>` — never `latest`, so every running Pod traces back to
one commit (`commit A → image A → Pod A`).

---

## 7. Security — Trivy

Each image is scanned for vulnerabilities and embedded secrets **before** it is pushed.
`severity: HIGH,CRITICAL` + `exit-code: 1` fails the pipeline on any fixable HIGH or
CRITICAL CVE; `ignore-unfixed: true` skips CVEs that have no patched package yet. Result
and reasoning: [`docs/TRIVY.md`](docs/TRIVY.md).

Container scanning is one layer of several: SAST (code), dependency scanning (`npm audit`,
pip), secret scanning (Trivy `secret` scanner / gitleaks), container scanning (Trivy),
runtime hardening (non-root, dropped capabilities, read-only root FS, Pod Security
`restricted`).

---

## 8. Terraform — AWS

`terraform/` creates, in `ap-south-1`: a VPC with **2 public + 2 private subnets**, an
internet gateway and one NAT gateway, and an **EKS 1.36 cluster** with a managed node group
(2 × t3.medium) and the EBS CSI add-on. No credentials are in the code; `terraform.tfvars.example`
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
| PostgreSQL | StatefulSet + PVC; password generated by Helm on first install and kept on upgrades |
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
# then push a commit - the CI deploy job runs helm upgrade --install with the SHA tag
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

## 12. Final demo script

| # | Show | How |
|---|---|---|
| 1 | Application | Open the UI, register a patient, book an appointment, check in |
| 2 | API | `/docs` → create / read / update / delete an appointment |
| 3 | Database | `kubectl exec -it careslot-postgres-0 -n careslot -- psql -U careslot -d careslot -c "select id, doctor_id, patient_id, scheduled_at, status from appointments;"` |
| 4 | Git | Change something small (e.g. a dashboard subtitle in `frontend/src/App.jsx`), `git commit` |
| 5 | CI | `git push` → Actions tab → test job (pytest) running |
| 6 | Docker | Build job building both images |
| 7 | Security | Trivy steps — "0 fixable HIGH/CRITICAL" |
| 8 | Registry | GHCR packages with the new SHA tag |
| 9 | Terraform | `terraform/main.tf`, `terraform output` |
| 10 | Kubernetes | `kubectl get pods,svc -n careslot` — new Pods with the new image: `kubectl get pods -n careslot -o jsonpath='{.items[*].spec.containers[0].image}'` |
| 11 | Helm | `helm list -n careslot`, `helm history careslot -n careslot` (rollback: `helm rollback careslot <rev> -n careslot`) |
| 12 | Ingress | Open the app via the Ingress hostname / load balancer |
| 13 | HPA | `scripts/load-test.sh` + `kubectl get hpa -n careslot -w` |
| 14 | Monitoring | Prometheus Targets (UP) and the Grafana dashboard reacting to the load |
| 15 | Failure | Apply a `troubleshooting/` manifest, diagnose, fix |

---

## 13. Rubric map

| Module | Where |
|---|---|
| M1 Application | `backend/app/`, `backend/alembic/versions/`, `frontend/`, `docker-compose.yml` |
| M2 Testing | `backend/tests/` (25 tests), `backend/pytest.ini`, `backend/tests/conftest.py` |
| M3 Git | commit history, `.gitignore` (`.env`, `__pycache__`, `node_modules`, `.venv`) |
| M4 Docker | `backend/Dockerfile`, `frontend/Dockerfile` (multi-stage, non-root), `docker-compose.yml` |
| M5 CI/CD | `.github/workflows/final-project.yml` |
| M6 DevSecOps | Trivy steps in the workflow, `docs/TRIVY.md` |
| M7 Terraform | `terraform/` |
| M8 Kubernetes + Helm | `k8s/namespace.yaml`, `helm/careslot/` |
| M9 Observability | `/metrics`, `monitoring/`, ServiceMonitor + dashboard in the chart |
| M10 Documentation | this README, `docs/SCREENSHOTS.md` |
