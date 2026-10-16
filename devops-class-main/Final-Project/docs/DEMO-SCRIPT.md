# CareSlot — presentation video script

Follows **SUBMISSION.md → "Video Requirements" in the required order**:

1. Present the PPT slides — what you built, architecture overview
2. Live walkthrough of: **Codebase** → **CI/CD** (trigger a push, pipeline end to end) →
   **Terraform** (`terraform plan` output, AWS Console VPC + EKS) → **ArgoCD** (synced
   application, GitOps flow) → **Kubernetes** (`kubectl get pods`, services, ingress) →
   **Prometheus** (Targets page, app `UP`) → **Grafana** (live dashboard)

GRADING.md M10 adds: "Be clear enough that the grader can follow along without asking
clarifying questions" and "Be uploaded directly to the GitHub repository (under a `demo/`
folder or as a release asset)". Planned length **≈18 min**. Spoken lines are in *italics* —
paraphrase freely; the slides' speaker notes contain the same text.

---

## Before you press record (≈10 min, not recorded)

1. **EKS is running** with everything installed (Terraform, ingress-nginx, metrics-server,
   monitoring, Argo CD, the `careslot` Application **Synced / Healthy**).
2. PowerShell — point your kubectl at EKS for the recording:
   ```
   aws eks update-kubeconfig --region ap-south-1 --name careslot-eks
   kubectl get application careslot -n argocd
   ```
3. Three more PowerShell windows, each left running:
   ```
   kubectl port-forward -n argocd svc/argocd-server 8443:80
   kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
   kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
   ```
4. Log in once (so no password typing on camera):
   - Argo CD http://localhost:8443 — user `admin`, password:
     `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}")))`
   - Grafana http://localhost:3001 — user `admin`, password:
     `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((kubectl -n monitoring get secret grafana-admin -o jsonpath="{.data.admin-password}")))`
     → open **CareSlot - API Overview**
5. Browser tabs: the app (`kubectl get ingress -n careslot` → ADDRESS), GitHub repo, GitHub
   Actions, AWS Console (region **Mumbai**) on EKS → `careslot-eks`, Argo CD, Prometheus
   `http://localhost:9090/targets?search=careslot`, Grafana.
6. Repo terminal: `git pull --rebase origin main` (GitOps bot commits arrive after each push).
7. Editor open at `devops-class-main/Final-Project/frontend/src/App.jsx`, line 11.
8. Optional: start a light load in the background so Grafana panels move during the video
   (ask Claude to run `scripts/load-test.sh`).

---

## Part 1 — Slides (≈5 min)

Open `demo/CareSlot-presentation.pptx` in slide-show mode; one or two sentences per slide
(speaker notes):

| Slide | Say (short) |
|---|---|
| 1 Title | *Who you are, what CareSlot is* |
| 2 What CareSlot does | *Patients, doctors, bookings; the booking rules the API enforces* |
| 3 Tech stack | *Layer by layer: React/Nginx, FastAPI, PostgreSQL, pytest, Docker, Actions, Terraform, Kubernetes* |
| 4 Architecture | *Browser → AWS load balancer → ingress-nginx → frontend / backend → PostgreSQL; Prometheus scrapes; Argo CD watches Git* |
| 5 CI/CD flow | *7 steps from push to Argo CD; what stops a bad change* |
| 6 Infrastructure | *VPC with 2 public + 2 private subnets, EKS 1.36, 53 resources, ~$0.40/h* |
| 7 Kubernetes setup | *Helm chart, Ingress, HPA 2 → 6, Argo CD, hardening* |
| 8 Observability | */metrics, ServiceMonitor, Grafana* |
| 9 Security | *44 → 0 CVEs, 5 → 0 leaks, non-root* |
| 10 Key learnings | *Pick two or three you can tell as a story* |
| 11 Thank you | *Next steps — then "now the live walkthrough"* |

## Part 2 — Live walkthrough

### 2.1 Codebase (≈2 min)
Show the repo in the editor / GitHub:
`devops-class-main/Final-Project/` → `backend/app` (main.py, routers/appointments.py — the
booking rules), `backend/tests` (45 tests), `backend/Dockerfile` + `frontend/Dockerfile`,
`helm/careslot` (templates, values-eks.yaml), `argocd/`, `terraform/`, `monitoring/`, and the
workflow `.github/workflows/final-project.yml`.

*"The backend is FastAPI with routers per resource; the booking rules live in
appointments.py and are covered by 45 tests. Each component has its own folder: Dockerfiles,
the Helm chart, Argo CD, Terraform and monitoring. The pipeline is one workflow file."*

### 2.2 CI/CD — trigger a push, show it end to end (≈6 min)
1. Editor line 11: `'Live overview of bookings and visits'` →
   `'Live overview of bookings and visits · v1.1'`, save.
2. Terminal:
   ```
   git add devops-class-main/Final-Project/frontend/src/App.jsx
   git commit -m "feat(frontend): show release v1.1 on the dashboard"
   git push origin main
   ```
3. GitHub → **Actions** → the new run of *Final Project - CareSlot CI/CD*; open each job as it runs:
   - **1. Test** — *"ruff, 45 pytest tests, the Alembic migrations on a real PostgreSQL, and the
     React build. If anything fails here, nothing gets built."*
   - **2. Build, Trivy scan, push** — expand *Trivy scan - backend image → Run Trivy*:
     *"Both images are scanned before they're pushed; any HIGH or CRITICAL vulnerability fails
     the job. Both are at zero. Then they go to GHCR, tagged with this commit's SHA."*
   - **3. GitOps deploy (Argo CD)** — *Promote the new images in Git*: *"CI doesn't run helm.
     It commits the new SHA into values-eks.yaml"* → *Wait for Argo CD to sync and roll out*:
     *"…and waits until Argo CD reports the new revision Synced and Healthy."*
4. Run green → switch to the app tab → **refresh**: the subtitle shows **"· v1.1"**.
   *"The change I committed a few minutes ago is live on EKS."*

### 2.3 Terraform — plan output + AWS Console (≈2 min)
```
cd devops-class-main/Final-Project/terraform
terraform plan
```
→ *"No changes. Your infrastructure matches the configuration."*
*"The whole environment is code: this plan compares my Terraform files with what's really
in AWS - no drift. When I first ran it, the plan was 53 resources to add"* (show
`docs/screenshots/m7-terraform-plan.png`). AWS Console (Mumbai): **VPC → Subnets**
(filter `careslot`: 2 public + 2 private) → **EKS → careslot-eks**: Active, 1.36, node group.

### 2.4 Argo CD — synced application, GitOps flow (≈2 min)
http://localhost:8443 → application **careslot**: **Synced** + **Healthy**, the resource tree
(Deployments → ReplicaSets → Pods, Services, Ingress, HPA, StatefulSet, ServiceMonitor).
Click *History and rollback* / the sync status: the revision is the bot commit
`deploy(careslot): promote images to …` — open that commit on GitHub to show the two changed
image tags.

*"This is GitOps: Git is the source of truth. CI wrote the new image tag into Git, Argo CD
noticed the commit and rolled it out. If I change something by hand with kubectl, Argo CD's
self-heal puts it back."*

### 2.5 Kubernetes (≈1 min)
```
kubectl get pods -n careslot -o wide
kubectl get svc -n careslot
kubectl get ingress -n careslot
kubectl get hpa -n careslot
```
*"Two backend and two frontend Pods - now with the new image SHA - plus PostgreSQL. Services are
ClusterIP; the Ingress is the only way in, through the AWS load balancer address. The HPA
keeps between two and six backend Pods."*

### 2.6 Prometheus (≈45 s)
http://localhost:9090/targets?search=careslot → `serviceMonitor/careslot/careslot-backend/0`
**2/2 UP**. *"Prometheus scrapes every backend Pod through the ServiceMonitor - both are UP."*

### 2.7 Grafana (≈1 min)
http://localhost:3001 → **CareSlot - API Overview** (namespace `careslot`): requests/s,
p95 latency, 5xx error rate, backend Pods, CPU per Pod.
*"Live metrics from the application: request rate, latency, zero errors, and the number of
backend Pods the autoscaler is running. That's the full project - thank you."*

---

## After recording

1. Keep the original file; export **MP4**. GitHub rejects files over **100 MB** — if it is
   larger, compress (e.g. HandBrake "Fast 1080p30") or attach it to a GitHub **Release** as an
   asset (allowed by GRADING.md) and link it from `demo/README.md`.
2. Save as `demo/CareSlot-demo.mp4`, commit, `git pull --rebase origin main`, push.
3. Tell Claude "recorded" → cleanup: delete the Argo CD Application, PVC, uninstall Helm
   releases, confirm no load balancer / EBS left, `terraform destroy`, delete the GitHub
   secrets, deactivate the IAM access key, `kubectl config use-context minikube`.
