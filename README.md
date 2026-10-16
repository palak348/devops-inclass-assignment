# DevOps — In-Class Assignments

**Palak Agrawal** · 24BCS10504

Each folder is one session's practical: the commands I ran, the output they
produced, and what I understood from it.

## Final Project — CareSlot (clinic appointment system)

**What the application does.** CareSlot is a front-desk app for a small clinic.
Reception staff register **patients** (10-digit mobile number, optional email and
date of birth), manage the **doctor** roster and each doctor's availability, and
**book appointments**. A visit moves through `SCHEDULED → CHECKED_IN → COMPLETED`
(or `CANCELLED`). The API refuses to double-book a doctor *or* a patient for
overlapping time slots, refuses bookings in the past and keeps finished visits
read-only. The dashboard shows today's appointments, the waiting room, upcoming
and completed visits, available doctors and the busiest doctor, and works on phones.

**How it is built and delivered.**

```text
React + Vite (Nginx, non-root)  ──/api──►  FastAPI (non-root)  ──►  PostgreSQL (Alembic migrations)

git push ─► GitHub Actions: ruff + pytest (45 tests) ─► React build ─► docker build ×2
         ─► Trivy gate (fail on any HIGH/CRITICAL) ─► GHCR, tag = commit SHA
         ─► Helm upgrade on AWS EKS (Terraform: VPC + EKS) ─► Ingress, HPA,
            Prometheus + Grafana
```

| | |
|---|---|
| Project folder + full documentation | [`devops-class-main/Final-Project`](devops-class-main/Final-Project) · [README](devops-class-main/Final-Project/README.md) |
| Evidence for every grading item | [`docs/SCREENSHOTS.md`](devops-class-main/Final-Project/docs/SCREENSHOTS.md) |
| Security scan result + CVE explained | [`docs/TRIVY.md`](devops-class-main/Final-Project/docs/TRIVY.md) |
| CI/CD pipeline | [`.github/workflows/final-project.yml`](.github/workflows/final-project.yml) · [runs](https://github.com/palak348/devops-inclass-assignment/actions/workflows/final-project.yml) |
| Run it locally | `cd devops-class-main/Final-Project && cp .env.example .env && docker compose up --build` → http://localhost:3000 |

Secret scanning: `gitleaks git` over the whole history of this repository reports no
leaks (policy in [`.gitleaks.toml`](.gitleaks.toml)).

## Contents

| Folder | What's inside |
|---|---|
| [`Linux Fundamentals`](devops-class-main/Linux%20Fundamentals) | Soft vs hard links, `adduser` vs `useradd`, `journalctl`, command cheat sheet |
| [`Networking Fundamentals`](devops-class-main/Networking%20Fundamentals) | `ping`, `tracert`, `ipconfig`, `netstat`, `nslookup`, plus the Linux `ip` commands |
| [`Shell-Scripting`](devops-class-main/Shell-Scripting) | `system_info.sh` — system info, user input, output redirection to a log file |
| [`Git-Github`](devops-class-main/Git-Github) | `git commit -a -m` vs `git commit -m`, and `git cherry-pick` |
| [`Docker-Fundamental`](devops-class-main/Docker-Fundamental) | Six Hello World apps containerised — Node.js, Python, Java, Apache, React, Nginx |
| [`Dockerfiles-Images`](devops-class-main/Dockerfiles-Images) | Multi-stage build on port 8080, plus three app types running together |
| [`Docker Network`](devops-class-main/Docker%20Network) | Custom bridge networks, container DNS, host network, bind mount, overlay networks |
| [`Final-Project`](devops-class-main/Final-Project) | **Capstone - CareSlot clinic appointments**: React + FastAPI + PostgreSQL, pytest, Docker, GitHub Actions, Trivy, GHCR, Terraform (AWS VPC + EKS), Helm, Ingress, HPA, Prometheus + Grafana |

## Environment

Windows 11 · Docker Desktop · Ubuntu containers for the Linux exercises
