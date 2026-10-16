# CareSlot — Clinic Appointment Platform on AWS EKS

[![CareSlot CI/CD](https://github.com/palak348/devops-inclass-assignment/actions/workflows/final-project.yml/badge.svg)](https://github.com/palak348/devops-inclass-assignment/actions/workflows/final-project.yml)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Terraform](https://img.shields.io/badge/Terraform-AWS%20VPC%20%2B%20EKS-7B42BC?logo=terraform&logoColor=white)
![Kubernetes](https://img.shields.io/badge/Kubernetes-Helm%20%2B%20Argo%20CD-326CE5?logo=kubernetes&logoColor=white)

DevOps capstone (Session 21) by **Palak Agrawal** (24BCS10504): a full-stack clinic
appointment system and the complete delivery chain around it — tests, container builds,
a vulnerability gate, a container registry, Terraform-provisioned AWS infrastructure,
GitOps deployment to Kubernetes, autoscaling and monitoring.

This repository also contains the practical work from every earlier session of the course
(see [Coursework](#12-coursework)).

| | |
|---|---|
| Source | [`devops-class-main/Final-Project/`](devops-class-main/Final-Project) |
| Pipeline | [`.github/workflows/final-project.yml`](.github/workflows/final-project.yml) · [runs](https://github.com/palak348/devops-inclass-assignment/actions/workflows/final-project.yml) |
| Evidence (every rubric item) | [`docs/EVIDENCE.md`](devops-class-main/Final-Project/docs/EVIDENCE.md) |
| Presentation | [`demo/`](devops-class-main/Final-Project/demo) (PPTX + PDF) |
| Component docs | [Backend](devops-class-main/Final-Project/backend/README.md) · [Frontend](devops-class-main/Final-Project/frontend/README.md) · [Helm chart](devops-class-main/Final-Project/helm/careslot/README.md) · [Terraform](devops-class-main/Final-Project/terraform/README.md) · [Argo CD](devops-class-main/Final-Project/argocd/README.md) · [Monitoring](devops-class-main/Final-Project/monitoring/README.md) · [Trivy](devops-class-main/Final-Project/docs/TRIVY.md) · [Troubleshooting](devops-class-main/Final-Project/troubleshooting/README.md) |

## Contents

1. [Project description and purpose](#1-project-description-and-purpose)
2. [Architecture](#2-architecture)
3. [Tech stack](#3-tech-stack)
4. [Local setup](#4-local-setup)
5. [CI/CD pipeline](#5-cicd-pipeline)
6. [Terraform infrastructure](#6-terraform-infrastructure)
7. [Kubernetes / Helm deployment](#7-kubernetes--helm-deployment)
8. [Observability](#8-observability)
9. [Security](#9-security)
10. [Known issues and limitations](#10-known-issues-and-limitations)
11. [Repository structure](#11-repository-structure)
12. [Coursework](#12-coursework)

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

## 4. Local setup

```bash
cd devops-class-main/Final-Project
cp .env.example .env            # put a real password into .env (git-ignored)
docker compose up --build       # postgres → backend → frontend, started in order by health checks
```

| URL | |
|---|---|
| http://localhost:3000 | CareSlot UI |
| http://localhost:8000/docs | Swagger (interactive API docs) |
| http://localhost:8000/health · `/ready` · `/metrics` | probes and Prometheus metrics |

Tests: `cd backend && python -m venv .venv && .venv\Scripts\pip install -r requirements-dev.txt && .venv\Scripts\python -m pytest -v`
End-to-end check of a running stack: `bash scripts/smoke-test.sh` (15 checks through the frontend proxy).

## 5. CI/CD pipeline

[`.github/workflows/final-project.yml`](.github/workflows/final-project.yml) runs on every push
to `main` that touches the project (and on pull requests, without pushing or deploying).

| Job | What it does | Fails the pipeline when |
|---|---|---|
| **1. Test** | ruff lint + format check → `pytest -v` → Alembic upgrade/downgrade/upgrade against a PostgreSQL service container → `npm ci && npm run build` | any lint error, failing test, broken migration or frontend build error |
| **2. Build, Trivy scan, push** | `docker build` backend + frontend → **Trivy** on both (`HIGH,CRITICAL`, vulnerabilities + secrets, `exit-code 1`, no `ignore-unfixed`) → push to GHCR | any HIGH/CRITICAL CVE - the image is never pushed |
| **3. GitOps deploy** | writes the commit SHA into `helm/careslot/values-eks.yaml` and commits it (`github-actions[bot]`); if the EKS cluster is running, refreshes Argo CD and waits until it is **Synced + Healthy** on that commit | Argo CD does not reach Healthy on the new revision |

Images: `ghcr.io/palak348/devops-inclass-assignment/careslot-{backend,frontend}:<commit SHA>` -
never `latest`, so every running Pod traces back to one commit. Both images currently report
**0 vulnerabilities of any severity** ([`docs/TRIVY.md`](devops-class-main/Final-Project/docs/TRIVY.md)).

## 6. Terraform infrastructure

[`terraform/`](devops-class-main/Final-Project/terraform) creates, in **ap-south-1 (Mumbai)**:
a VPC `10.20.0.0/16` with **2 public + 2 private subnets** in two AZs, an internet gateway,
one NAT gateway, and the **EKS 1.36** cluster `careslot-eks` with a managed node group of
**2 × m7i-flex.large** (AL2023) plus the add-ons vpc-cni, kube-proxy, coredns,
eks-pod-identity-agent and aws-ebs-csi-driver - **53 resources**.

```bash
cd devops-class-main/Final-Project/terraform
terraform init && terraform plan -out tfplan && terraform apply tfplan     # ~15-20 min
aws eks update-kubeconfig --region ap-south-1 --name careslot-eks
terraform destroy                                                          # after removing the LB/PVC, see terraform/README.md
```

No credentials in code (`aws configure` / GitHub secrets only), `terraform.tfvars.example`
documents the variables, no KMS key or log group so `destroy` leaves nothing billable behind.

## 7. Kubernetes / Helm deployment

Commands in sections 7 and 8 run from `devops-class-main/Final-Project`.

**EKS (GitOps, used for the demo)** - once per cluster:

```bash
kubectl apply -f k8s/namespace.yaml -f k8s/storageclass-gp3.yaml
kubectl create secret generic careslot-postgres-credentials -n careslot \
  --from-literal=username=careslot --from-literal=database=careslot --from-literal=password="$(openssl rand -hex 24)"
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx --version 4.15.1 -n ingress-nginx --create-namespace
helm upgrade --install metrics-server metrics-server/metrics-server --version 3.14.0 -n kube-system
# monitoring: see section 8
helm upgrade --install argocd argo/argo-cd --version 10.10.5 -n argocd --create-namespace -f argocd/argocd-values.yaml
kubectl apply -f argocd/careslot-application.yaml        # Argo CD deploys helm/careslot with values-eks.yaml
```

From then on **every `git push` deploys itself**: CI commits the new image SHA, Argo CD syncs it.

**minikube (local)** - plain Helm:

```bash
minikube addons enable ingress && minikube addons enable metrics-server
kubectl apply -f k8s/namespace.yaml
helm upgrade --install careslot helm/careslot -n careslot -f helm/careslot/values-minikube.yaml --wait
```

What the chart deploys: backend ×2 (HPA 2-6 on CPU 60 %), frontend ×2, PostgreSQL StatefulSet
with a PVC, ClusterIP Services, Ingress (`/api` → backend, `/` → frontend), probes
(`/health`, `/ready`, `/healthz`), non-root security contexts, ServiceMonitor and Grafana dashboard.

## 8. Observability

```bash
kubectl create secret generic grafana-admin -n monitoring --from-literal=admin-user=admin --from-literal=admin-password="$(openssl rand -base64 18)"
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack --version 92.8.0 -n monitoring \
  -f monitoring/prometheus-values.yaml -f monitoring/grafana-values.yaml
```

The backend exposes Prometheus metrics on `/metrics`; the chart's **ServiceMonitor** makes
Prometheus scrape every backend Pod (Targets page: `serviceMonitor/careslot/careslot-backend/0`
**UP**); Grafana loads the **CareSlot - API Overview** dashboard: requests/s, p95 latency,
5xx error rate, live backend Pod count and per-Pod CPU (the HPA's signal).

## 9. Security

- Images scanned by Trivy before push; the gate fails on any HIGH/CRITICAL CVE.
- `gitleaks git` over the **whole history** of this repository reports **no leaks**
  (policy: [`.gitleaks.toml`](.gitleaks.toml) - default rules + five reviewed fake demo strings
  in earlier session write-ups).
- All containers run as non-root with all Linux capabilities dropped; backend root filesystem
  is read-only; the namespace enforces Pod Security `restricted`.
- Database and Grafana passwords are generated inside the cluster, never stored in Git.

## 10. Known issues and limitations

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

---

## 11. Repository structure

```text
.
├── .github/workflows/
│   ├── final-project.yml        CareSlot CI/CD: test → build → Trivy → GHCR → GitOps deploy
│   ├── ci.yml · cd.yml          Session 16 (CI/CD & GitHub Actions)
│   └── devsecops.yml            Session 17 (DevSecOps)
├── .gitleaks.toml               secret-scanning policy for the whole history
└── devops-class-main/
    ├── Final-Project/           CareSlot
    │   ├── backend/             FastAPI app, Alembic migrations, pytest suite, Dockerfile
    │   ├── frontend/            React + Vite SPA, Nginx template, multi-stage Dockerfile
    │   ├── docker-compose.yml   local stack: postgres + backend + frontend
    │   ├── terraform/           AWS VPC + EKS
    │   ├── k8s/                 namespace and StorageClass (cluster bootstrap)
    │   ├── helm/careslot/       Helm chart, values per environment, Grafana dashboard
    │   ├── argocd/              Argo CD install values and the CareSlot Application
    │   ├── monitoring/          kube-prometheus-stack values (Prometheus, Grafana)
    │   ├── troubleshooting/     deliberately broken manifests + investigation write-up
    │   ├── scripts/             smoke test and load test
    │   ├── docs/                evidence index, Trivy report, screenshots
    │   └── demo/                presentation deck (PPTX + PDF)
    └── <session folders>/       earlier coursework, see below
```

GitHub only runs workflows from the repository root, so the CareSlot pipeline lives in
`.github/workflows/` and is scoped to `devops-class-main/Final-Project/**` with a path filter.

---

## 12. Coursework

Practical work from the earlier sessions. Each folder has its own README with the commands
run, their output and the conclusions drawn.

| Area | Folder | Topics |
|---|---|---|
| Foundations | [Linux Fundamentals](devops-class-main/Linux%20Fundamentals) | Soft vs hard links, `adduser` vs `useradd`, `journalctl` |
| | [Networking Fundamentals](devops-class-main/Networking%20Fundamentals) | `ping`, `tracert`, `ipconfig`, `netstat`, `nslookup`, Linux `ip` |
| | [Git-Github](devops-class-main/Git-Github) | `git commit -a -m` vs `git commit -m`, `git cherry-pick` |
| | [Shell-Scripting](devops-class-main/Shell-Scripting) | System-information script with user input and log redirection |
| Containers | [Docker-Fundamental](devops-class-main/Docker-Fundamental) | Six applications containerised (Node.js, Python, Java, Apache, React, Nginx) |
| | [Dockerfiles-Images](devops-class-main/Dockerfiles-Images) | Multi-stage build, image documentation, multi-app deployment |
| | [Docker Network](devops-class-main/Docker%20Network) | Bridge and host networks, container DNS, bind mounts, overlay networks |
| Kubernetes | [Kubernetes Fundamentals](devops-class-main/Kubernetes%20Fundamentals) | minikube, cluster architecture, Kubernetes Basics tutorial |
| | [Pods, ReplicaSets & Deployments](devops-class-main/Kubernetes%20Pods%2C%20ReplicaSets%20%26%20Deployments) | Rolling update, blue-green, canary, recreate; Pod lifecycle |
| | [Networking & Services](devops-class-main/Kubernetes%20Networking%20%26%20Services) | ClusterIP, NodePort, LoadBalancer, ExternalName, headless; CoreDNS |
| | [Ingress, ConfigMaps & Secrets](devops-class-main/Kubernetes%20Ingress%2C%20ConfigMaps%20%26%20Secrets) | Configuration injection, host/path routing, Ingress vs controller |
| | [Storage, HPA & Probes](devops-class-main/Kubernetes%20Storage%2C%20HPA%20%26%20Probes) | Volumes, PV/PVC, StorageClasses, HPA under load, probes |
| | [Kubernetes Troubleshooting](devops-class-main/Kubernetes%20Troubleshooting) | Nine common failure modes reproduced and fixed |
| | [Helm](devops-class-main/Helm) | Install / upgrade / rollback workflow, chart written from scratch |
| Delivery | [CI-CD & GitHub Actions](devops-class-main/CI-CD%20%26%20GitHub%20Actions) | CI and CD pipelines (`ci.yml`, `cd.yml`) |
| | [DevSecOps](devops-class-main/DevSecOps) | SAST, dependency, secret and image scanning as pipeline gates (`devsecops.yml`) |
| Cloud | [Terraform & Infrastructure as Code](devops-class-main/Terraform%20%26%20Infrastructure%20as%20Code) | Terraform workflow end to end, AWS service research |
| | [Cloud & Terraform in Action](devops-class-main/Cloud%20%26%20Terraform%20in%20Action) | Multi-tier AWS environment built with Terraform (26 resources) |
| Operations | [Monitoring, Observability & GitOps](devops-class-main/Monitoring%2C%20Observability%20%26%20GitOps) | Prometheus alerts, observability pillars, Argo CD |

Environment: Windows 11 · Docker Desktop · minikube · AWS `ap-south-1`
