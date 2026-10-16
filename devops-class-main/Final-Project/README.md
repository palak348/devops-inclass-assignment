# CareSlot — Clinic Appointment Platform on AWS EKS

[![CareSlot CI/CD](https://github.com/palak348/devops-inclass-assignment/actions/workflows/final-project.yml/badge.svg)](https://github.com/palak348/devops-inclass-assignment/actions/workflows/final-project.yml)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Terraform](https://img.shields.io/badge/Terraform-AWS%20VPC%20%2B%20EKS-7B42BC?logo=terraform&logoColor=white)
![Kubernetes](https://img.shields.io/badge/Kubernetes-Helm%20%2B%20Argo%20CD-326CE5?logo=kubernetes&logoColor=white)

Session 21 DevOps capstone · **Palak Agrawal** (24BCS10504)

A full-stack clinic appointment system and the complete delivery chain around it: tests,
container builds, a vulnerability gate, a container registry, Terraform-provisioned AWS
infrastructure, GitOps deployment to Kubernetes, autoscaling and monitoring.

| | |
|---|---|
| Pipeline | [`.github/workflows/final-project.yml`](../../.github/workflows/final-project.yml) · [runs](https://github.com/palak348/devops-inclass-assignment/actions/workflows/final-project.yml) |
| Evidence (every rubric item) | [`docs/EVIDENCE.md`](docs/EVIDENCE.md) |
| Presentation | [`demo/`](demo) (PPTX + PDF) |
| Component docs | [Backend](backend/README.md) · [Frontend](frontend/README.md) · [Helm chart](helm/careslot/README.md) · [k8s](k8s/README.md) · [Terraform](terraform/README.md) · [Argo CD](argocd/README.md) · [Monitoring](monitoring/README.md) · [Trivy](docs/TRIVY.md) · [Troubleshooting](troubleshooting/README.md) · [Scripts](scripts/README.md) |

## Contents

1. [Project description and purpose](#1-project-description-and-purpose)
2. [Architecture](#2-architecture)
3. [Tech stack](#3-tech-stack)
4. [Repository layout](#4-repository-layout)
5. [Application](#5-application)
6. [Local setup](#6-local-setup)
7. [Tests](#7-tests)
8. [Docker](#8-docker)
9. [CI/CD pipeline](#9-cicd-pipeline)
10. [Security](#10-security)
11. [Terraform infrastructure](#11-terraform-infrastructure)
12. [Kubernetes / Helm deployment](#12-kubernetes--helm-deployment)
13. [Observability](#13-observability)
14. [Troubleshooting](#14-troubleshooting)
15. [Known issues and limitations](#15-known-issues-and-limitations)
16. [Rubric map](#16-rubric-map)

---

## 1. Project description and purpose

CareSlot is a front-desk application for a small clinic. Reception staff register **patients**
(10-digit mobile number, optional email and date of birth), manage the **doctor** roster and
each doctor's availability, and **book appointments**. A visit moves through
`SCHEDULED → CHECKED_IN → COMPLETED` (or `CANCELLED`). The API refuses to double-book a doctor
*or* a patient for overlapping slots, rejects bookings in the past and keeps finished visits
read-only. The dashboard shows today's appointments, the waiting room, upcoming and completed
visits, available doctors and the busiest doctor, and works on phones.

The purpose of the project is the **delivery chain** around that application: from a commit on a
laptop, through automated tests, container builds, a security gate and a registry, to a
GitOps-managed, autoscaling and monitored deployment on AWS EKS created with Terraform.

## 2. Architecture

```text
                    ┌────────────────────────── AWS ap-south-1 (Terraform) ──────────────────────────┐
                    │  VPC 10.20.0.0/16 · 2 public + 2 private subnets · NAT gateway                  │
  Browser ──HTTP──► │  Classic LB ─► ingress-nginx ─┬─ /api ─► careslot-backend  (FastAPI, ×2..6 HPA) │
                    │  (public subnets)             └─ /    ─► careslot-frontend (React on Nginx, ×2)  │
                    │                                            │                                     │
                    │  EKS 1.36 · 2 × m7i-flex.large            ▼                                     │
                    │  (private subnets)              careslot-postgres (StatefulSet + EBS gp3 PVC)    │
                    │                                                                                  │
                    │  monitoring: Prometheus ◄─ ServiceMonitor ─ /metrics ; Grafana dashboard         │
                    │  argocd: Argo CD ── watches Git ── keeps namespace "careslot" = helm/careslot    │
                    └──────────────────────────────────────────────────────────────────────────────────┘

 git push ─► GitHub Actions ─► 1 Test: ruff · 45 pytest tests · Alembic on PostgreSQL · React build
                            ─► 2 Build: docker build ×2 ─► Trivy gate (any HIGH/CRITICAL fails) ─► GHCR (tag = SHA)
                            ─► 3 GitOps: commit new SHA to values-eks.yaml ─► Argo CD syncs ─► rolling update
```

| Component | Role |
|---|---|
| Frontend | React SPA served by unprivileged Nginx (uid 101); proxies `/api` locally, Ingress routes it on Kubernetes |
| Backend | FastAPI REST API (uid 10001), SQLAlchemy, Pydantic validation, `/health`, `/ready`, `/metrics` |
| Database | PostgreSQL 16; schema by Alembic migrations run at backend start (advisory lock for parallel replicas) |
| Kubernetes | Helm chart `careslot`: Deployments, ClusterIP Services, StatefulSet + PVC, Ingress, HPA, ServiceMonitor, dashboard ConfigMap; namespace with Pod Security `restricted` |
| GitOps | Argo CD Application with automated sync, prune and self-heal |
| Observability | kube-prometheus-stack (Prometheus Operator, Prometheus, Grafana, kube-state-metrics, node-exporter) |

## 3. Tech stack

| Area | Tools |
|---|---|
| Languages | Python 3.12, JavaScript (React 19), HCL, YAML, Bash |
| Application | FastAPI, SQLAlchemy 2, Pydantic, Alembic, PostgreSQL 16, React + Vite 8, Nginx |
| Testing / quality | pytest (45 tests, isolated SQLite per test), ruff |
| Containers | Docker, Docker Compose, multi-stage builds, Alpine base images, non-root users |
| CI/CD | GitHub Actions, GitHub Container Registry (GHCR) |
| Security | Trivy (image vulnerabilities + secrets), gitleaks (whole git history), Pod Security `restricted` |
| Infrastructure | Terraform 1.16, AWS provider 6.69, `terraform-aws-modules/vpc` 6.7.3 + `eks` 21.29.0, AWS VPC / EKS / EBS / ELB |
| Kubernetes | EKS 1.36, Helm 4, ingress-nginx 4.15.1, metrics-server 3.14.0, HPA; minikube for local work |
| GitOps | Argo CD v3.5.5 (Helm chart 10.10.5) |
| Observability | Prometheus, Grafana (kube-prometheus-stack 92.8.0), prometheus-fastapi-instrumentator |

## 4. Repository layout

```text
Final-Project/
├── backend/            FastAPI app (app/), Alembic (alembic/), pytest (tests/), Dockerfile
├── frontend/           React app (src/), Nginx template (nginx/), multi-stage Dockerfile
├── docker-compose.yml  postgres + backend + frontend
├── terraform/          AWS VPC + EKS
├── k8s/                namespace.yaml, storageclass-gp3.yaml (cluster bootstrap)
├── helm/careslot/      Helm chart (+ values-minikube.yaml, values-eks.yaml = GitOps desired state, Grafana dashboard)
├── argocd/             Argo CD install values + the CareSlot Application (GitOps)
├── monitoring/         kube-prometheus-stack values: prometheus-values.yaml, grafana-values.yaml
├── troubleshooting/    broken-image.yaml, broken-service.yaml + walkthrough
├── scripts/            smoke-test.sh (end-to-end API checks), load-test.sh (HPA demo)
├── docs/               EVIDENCE.md (rubric → screenshot index), TRIVY.md, screenshots/
└── demo/               presentation deck (PPTX + PDF)

../../.github/workflows/final-project.yml   CI/CD (GitHub only runs workflows from the repo root)
```

## 5. Application

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

## 6. Local setup

### Docker Compose (whole stack)

```bash
cp .env.example .env            # put a real password into .env (git-ignored)
docker compose up --build       # postgres → backend → frontend, started in order by health checks
```

| URL | |
|---|---|
| http://localhost:3000 | CareSlot UI |
| http://localhost:8000/docs | Swagger (interactive API docs) |
| http://localhost:8000/health · `/ready` · `/metrics` | Probes and Prometheus metrics |

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

## 7. Tests

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

## 8. Docker

| Image | Build | Runs as |
|---|---|---|
| `backend/Dockerfile` | `python:3.12-alpine`, `apk upgrade`, deps installed from prebuilt wheels then **pip removed** from the image, healthcheck on `/health`, CMD runs `alembic upgrade head` then `uvicorn` | uid **10001** (`appuser`) |
| `frontend/Dockerfile` | **multi-stage**: `node:22-alpine` runs `npm ci && npm run build` → only `dist/` is copied into `nginxinc/nginx-unprivileged:1.30-alpine` (+ `apk upgrade`) | uid **101** (`nginx`), port 8080 |

The frontend Nginx config is a template: `BACKEND_URL` is filled in at container start
(`http://backend:8000` in Compose, `http://careslot-backend:8000` in Kubernetes).
Compose starts services in order using health checks: postgres healthy → backend healthy → frontend.

## 9. CI/CD pipeline

[`.github/workflows/final-project.yml`](../../.github/workflows/final-project.yml) runs on every
push to `main` that touches `devops-class-main/Final-Project/**` (and on pull requests, without
pushing or deploying).

| Job | What it does | Fails the pipeline when |
|---|---|---|
| **1. Test** | ruff lint + format check → `pytest -v` → Alembic upgrade/downgrade/upgrade against a PostgreSQL service container → `npm ci && npm run build` | any lint error, failing test, broken migration or frontend build error |
| **2. Build, Trivy scan, push** | `docker build` backend + frontend → **Trivy** on both (`HIGH,CRITICAL`, vulnerabilities + secrets, `exit-code 1`, no `ignore-unfixed`) → push to GHCR | any HIGH/CRITICAL CVE - the image is never pushed |
| **3. GitOps deploy** | writes the commit SHA into `helm/careslot/values-eks.yaml` and commits it (`github-actions[bot]`); if the EKS cluster is running, refreshes Argo CD and waits until it is **Synced + Healthy** on that commit | Argo CD does not reach Healthy on the new revision |

Images: `ghcr.io/palak348/devops-inclass-assignment/careslot-{backend,frontend}:<commit SHA>` -
never `latest`, so every running Pod traces back to one commit (`commit A → image A → Pod A`).
CI never runs `helm` against EKS: Argo CD applies what Git says.

## 10. Security

- **Container scanning:** each image is scanned for vulnerabilities and embedded secrets
  **before** it is pushed. `severity: HIGH,CRITICAL` + `exit-code: 1` fails the pipeline on
  **any** HIGH or CRITICAL CVE, including ones without a patch yet (no `ignore-unfixed`). Both
  images currently report **0 vulnerabilities of any severity**. Findings, the CVE explained
  (CVE-2026-85091 in zlib) and how each one was removed: [`docs/TRIVY.md`](docs/TRIVY.md).
- **Secret scanning of the whole git history:** `gitleaks git` over every commit of this
  repository reports **no leaks** using the repo-root [`.gitleaks.toml`](../../.gitleaks.toml).
  It keeps all default rules and allowlists exactly five strings in two *earlier session*
  write-ups (`DevSecOps/readme.md`, `Kubernetes Ingress, ConfigMaps & Secrets/readme.md`) that
  are deliberately fake teaching examples. No real credential has ever been committed; AWS keys
  live only in `aws configure` and in GitHub Actions secrets.
- **Runtime hardening:** all containers run as non-root with all Linux capabilities dropped;
  the backend root filesystem is read-only; the namespace enforces Pod Security `restricted`.
- Database and Grafana passwords are generated inside the cluster, never stored in Git.

## 11. Terraform infrastructure

[`terraform/`](terraform) creates, in **ap-south-1 (Mumbai)**: a VPC `10.20.0.0/16` with
**2 public + 2 private subnets** in two AZs, an internet gateway, one NAT gateway, and the
**EKS 1.36** cluster `careslot-eks` with a managed node group of **2 × m7i-flex.large** (AL2023)
plus the add-ons vpc-cni, kube-proxy, coredns, eks-pod-identity-agent and aws-ebs-csi-driver -
**53 resources**.

```bash
cd terraform
terraform init && terraform plan -out tfplan && terraform apply tfplan     # ~15-20 min
aws eks update-kubeconfig --region ap-south-1 --name careslot-eks
terraform destroy                                                          # after removing the LB/PVC, see terraform/README.md
```

No credentials in code (`aws configure` / GitHub secrets only), `terraform.tfvars.example`
documents the variables, no KMS key or log group so `destroy` leaves nothing billable behind.
Cost table and the clean destroy order: [`terraform/README.md`](terraform/README.md).

## 12. Kubernetes / Helm deployment

Chart: [`helm/careslot`](helm/careslot) (`Chart.yaml`, `values.yaml`, `templates/`).

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

### EKS (GitOps)

Once per cluster, after `terraform apply`:

```bash
kubectl apply -f k8s/namespace.yaml -f k8s/storageclass-gp3.yaml
kubectl create secret generic careslot-postgres-credentials -n careslot \
  --from-literal=username=careslot --from-literal=database=careslot --from-literal=password="$(openssl rand -hex 24)"
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx --version 4.15.1 -n ingress-nginx --create-namespace
helm upgrade --install metrics-server metrics-server/metrics-server --version 3.14.0 -n kube-system
# monitoring stack: section 13
helm upgrade --install argocd argo/argo-cd --version 10.10.5 -n argocd --create-namespace -f argocd/argocd-values.yaml
kubectl apply -f argocd/careslot-application.yaml        # Argo CD deploys helm/careslot with values-eks.yaml
```

From then on **every `git push` deploys itself**: CI commits the new image SHA, Argo CD syncs
it. Details: [`argocd/README.md`](argocd/README.md).

### minikube (plain Helm)

```bash
minikube start
minikube addons enable ingress
minikube addons enable metrics-server

# monitoring first (provides the ServiceMonitor CRD) - section 13
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

### Autoscaling

```bash
kubectl get hpa -n careslot -w          # terminal 1
bash scripts/load-test.sh 180 30        # terminal 2
```

Measured on minikube: CPU rose to **182 % / 60 %** and the HPA scaled the backend from
**2 → 6** Pods, then back to 2 after the load stopped.

## 13. Observability

```bash
kubectl create secret generic grafana-admin -n monitoring --from-literal=admin-user=admin --from-literal=admin-password="$(openssl rand -base64 18)"
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack --version 92.8.0 -n monitoring \
  -f monitoring/prometheus-values.yaml -f monitoring/grafana-values.yaml
```

The backend exposes Prometheus metrics on `/metrics`; the chart's **ServiceMonitor** makes
Prometheus scrape every backend Pod (Targets page: `serviceMonitor/careslot/careslot-backend/0`
**UP**); Grafana loads the **CareSlot - API Overview** dashboard: requests/s, p95 latency,
5xx error rate, live backend Pod count and per-Pod CPU (the HPA's signal). Install and access:
[`monitoring/README.md`](monitoring/README.md).

## 14. Troubleshooting

`troubleshooting/broken-image.yaml` (ImagePullBackOff) and
`troubleshooting/broken-service.yaml` (Service selector matches no Pods) — symptoms,
commands, root cause and fix from a real run: [`troubleshooting/README.md`](troubleshooting/README.md).

## 15. Known issues and limitations

| # | Limitation | Why / what production would do |
|---|---|---|
| 1 | **No user login** - anyone who can reach the UI can book or delete | Out of scope for the capstone; production needs authentication (OIDC) and roles (reception, doctor) |
| 2 | **HTTP only**, reached on the load balancer's DNS name | No domain or certificate; production: Route 53 + ACM/cert-manager TLS on the Ingress |
| 3 | **PostgreSQL runs inside the cluster**, one replica, no backups | Simple and cheap for a demo; production: Amazon RDS (Multi-AZ, automated backups) |
| 4 | **Terraform state is local** | Single developer; a team needs an S3 backend with locking |
| 5 | **One NAT gateway** | Saves cost; an outage in its AZ cuts outbound traffic from the private subnets |
| 6 | **AWS Free-plan account constraints**: only Free-Tier-eligible instance types (so `m7i-flex.large`, not `t3.medium`) and a small EC2 vCPU quota → node group capped at 2 nodes, no cluster autoscaler | At peak the HPA's 6 backend Pods share 2 nodes; a paid account would add Karpenter/Cluster Autoscaler |
| 7 | **Monitoring has no persistent storage** and Alertmanager is disabled | Prometheus keeps 2 days in memory/emptyDir; production: persistent volumes + alert rules to Slack/email |
| 8 | **CI uses a long-lived IAM access key** (GitHub secret) to watch the rollout | Production: GitHub OIDC → IAM role with least privilege; the key is deleted after the demo |
| 9 | **GitOps bot commits**: after each push the pipeline adds a `deploy(careslot): …` commit | Run `git pull --rebase origin main` before pushing again |
| 10 | EKS console *Nodes* tab shows "Unauthorized" for the root user | Only the cluster creator (`careslot-admin`) has a Kubernetes access entry; the *Node groups* tab works |
| 11 | HPA scales on CPU only; latency histogram buckets are coarse (p95 caps at 1 s under overload) | Good enough to demonstrate; production would add request-rate based scaling and finer buckets |

## 16. Rubric map

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
| M10 Documentation | this README (full technical documentation incl. known issues), `demo/` (slide deck PPTX + PDF) |

Screenshots for every item: [`docs/EVIDENCE.md`](docs/EVIDENCE.md).
