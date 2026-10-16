# DevOps — In-Class Assignments & Final Project

**Palak Agrawal** · 24BCS10504

Practical work for every session of the DevOps course and the final capstone project.

## Final project — CareSlot

[![CareSlot CI/CD](https://github.com/palak348/devops-inclass-assignment/actions/workflows/final-project.yml/badge.svg)](https://github.com/palak348/devops-inclass-assignment/actions/workflows/final-project.yml)

A clinic appointment system (FastAPI, React, PostgreSQL) delivered end to end: pytest-gated
CI, Docker images scanned by Trivy and pushed to GHCR, AWS VPC + EKS provisioned with
Terraform, GitOps deployment with Helm and Argo CD, autoscaling, and Prometheus + Grafana
monitoring.

| | |
|---|---|
| Documentation | [`devops-class-main/Final-Project/README.md`](devops-class-main/Final-Project/README.md) |
| Source | [`devops-class-main/Final-Project/`](devops-class-main/Final-Project) |
| Pipeline | [`.github/workflows/final-project.yml`](.github/workflows/final-project.yml) · [runs](https://github.com/palak348/devops-inclass-assignment/actions/workflows/final-project.yml) |
| Evidence | [`docs/EVIDENCE.md`](devops-class-main/Final-Project/docs/EVIDENCE.md) |
| Presentation | [`demo/`](devops-class-main/Final-Project/demo) (PPTX + PDF) |

## Repository structure

```text
.
├── .github/workflows/
│   ├── final-project.yml   CareSlot CI/CD (scoped to devops-class-main/Final-Project/**)
│   ├── ci.yml · cd.yml     Session 16 — CI/CD & GitHub Actions
│   └── devsecops.yml       Session 17 — DevSecOps
├── .gitleaks.toml          secret-scanning policy for the whole history
└── devops-class-main/
    ├── Final-Project/      CareSlot capstone
    └── <session folders>/  coursework, listed below
```

GitHub only runs workflows from the repository root, so every pipeline lives in
`.github/workflows/` and uses a path filter for its own folder.

## Coursework

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
