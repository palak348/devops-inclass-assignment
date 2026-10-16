# CareSlot — demo video script (recorded walkthrough)

Covers, in order, everything README.md requires the student to demonstrate —
*Application → Git commit → CI pipeline → Docker image → Security scan → Registry →
Terraform infrastructure → Kubernetes deployment → Helm → Ingress → Autoscaling →
Monitoring → Troubleshooting* — plus all 15 steps of "Part O – Final demo", and the
graded M10 item **"commit a change, watch the pipeline run, see the deployment update"**.

Target length **15–20 min**. Speak the *italic* lines (or paraphrase) — M10 grades that you
understand *what you built and why each component exists*.

---

## Before you press record

Everything runs on EKS (`terraform apply` done, add-ons installed, baseline deployed by CI).

| Window | Prepare |
|---|---|
| Browser tab 1 | `http://<LOAD-BALANCER-HOST>` (CareSlot on EKS) |
| Browser tab 2 | `https://github.com/palak348/devops-inclass-assignment/actions` |
| Browser tab 3 | GHCR: `https://github.com/palak348/devops-inclass-assignment/pkgs/container/devops-inclass-assignment%2Fcareslot-backend` |
| Browser tab 4 | AWS Console, region **Mumbai** → EKS → `careslot-eks` |
| PowerShell A | repo folder, `kubectl config current-context` shows the **EKS** cluster |
| PowerShell B | `kubectl port-forward -n careslot svc/careslot-backend 18000:8000` (for Swagger) |
| PowerShell C | `kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80` (log in to Grafana before recording) |
| PowerShell D | `kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090` |
| Editor | `devops-class-main/Final-Project/frontend/src/App.jsx` open at line 11 |

Get the load-balancer host: `kubectl get ingress -n careslot` → ADDRESS column.

---

## 1. Application (≈1.5 min) — Part O step 1

Tab 1 (app on EKS). Patients → register `Riya Sharma` / `9876543210` → Book appointment →
Dashboard → **Check in**.

*"This is CareSlot, a clinic front-desk app I built. Reception registers patients, manages
doctors and books appointments. The backend rejects double bookings for a doctor or a patient,
bookings in the past, and invalid phone numbers. It's running on my AWS EKS cluster right now,
reached through the load balancer address in the URL bar."*

## 2. API (≈1.5 min) — Part O step 2

Browser → `http://localhost:18000/docs` → Swagger. Run **POST /api/patients**, **GET
/api/patients/{id}**, **PUT** (change the phone), **DELETE**.

*"The backend is FastAPI. Swagger documents every endpoint; here I create, read, update and
delete a record live against the API inside Kubernetes."*

## 3. Database (≈45 s) — Part O step 3

PowerShell A:
```
kubectl exec -n careslot careslot-postgres-0 -- psql -U careslot -d careslot -c "select id, patient_id, doctor_id, scheduled_at, status from appointments;"
```
*"Data lives in PostgreSQL. The schema is created by Alembic migrations when the backend
starts - here is the appointments table with the visit I just booked."*

## 4. Git commit (≈1 min) — Part O step 4, M10

Editor: line 11, change
`'Live overview of bookings and visits'` → `'Live overview of bookings and visits · v1.1'`, save.
PowerShell A:
```
git add devops-class-main/Final-Project/frontend/src/App.jsx
git commit -m "feat(frontend): show release v1.1 on the dashboard"
git log --oneline -1
```
*"Now the important part: I change the application and commit it. Every commit can become a
release, and the commit SHA will follow the change all the way to the running Pods."*

## 5. CI pipeline (≈1 min) — Part O step 5, M10

```
git push origin main
```
Tab 2 → the new run of **Final Project - CareSlot CI/CD** → open job **1. Test**.

*"The push triggers GitHub Actions. The first job is the quality gate: ruff, 45 pytest tests,
Alembic migrations against a real PostgreSQL, and the React build. If a test fails, the
pipeline stops and no image is built."*

> The run takes about 6–8 min. Do steps 9–15 while it runs, then come back for 6–8 and the rollout.

## 9. Terraform infrastructure (≈1.5 min) — Part O step 9

Editor: `terraform/main.tf`. Tab 4: EKS cluster **Active**, node group.

*"The infrastructure is code. Terraform creates the VPC with two public and two private
subnets, a NAT gateway, and the EKS cluster with a managed node group. I can create and destroy
the whole environment with one command, which is how I keep the cost under control."*

## 10. Kubernetes (≈1 min) — Part O step 10

```
kubectl get pods -n careslot -o wide
kubectl get svc -n careslot
```
*"Two backend and two frontend replicas plus PostgreSQL with a persistent EBS volume. Services
give the Pods stable names inside the cluster; all of them are ClusterIP, nothing is exposed
directly."*

## 11. Helm (≈45 s) — Part O step 11

```
helm list -n careslot
helm history careslot -n careslot
```
*"The whole application is one Helm chart. Every deployment is a numbered revision, so I can
roll back with `helm rollback`."*

## 12. Ingress (≈45 s) — Part O step 12

```
kubectl get ingress -n careslot
```
*"One Ingress sends `/api` to the FastAPI service and everything else to the React frontend.
The ingress-nginx controller sits behind the AWS load balancer you saw in the URL bar."*

## 13. Autoscaling (≈2 min) — Part O step 13

PowerShell A: `kubectl get hpa -n careslot -w` — **cue Claude to start the load test**.
Watch TARGETS rise above 60 % and REPLICAS go 2 → 6.

*"The Horizontal Pod Autoscaler watches CPU. Under load it adds backend Pods automatically, and
removes them again when the load is gone."*

## 14. Monitoring (≈1.5 min) — Part O step 14

Browser → `http://localhost:9090/targets` (search `careslot`: 2/2 **UP**) → `http://localhost:3001`
→ dashboard **CareSlot - API Overview** (requests/s, p95 latency, 5xx rate, pods, CPU).

*"The backend exposes Prometheus metrics on /metrics. A ServiceMonitor tells Prometheus to
scrape every backend Pod, and Grafana shows request rate, latency and errors - you can see the
load test and the extra Pods here."*

## 15. Troubleshooting (≈2 min) — Part O step 15

```
kubectl apply -f devops-class-main/Final-Project/troubleshooting/broken-image.yaml
kubectl get pods -n careslot -l app.kubernetes.io/name=backend-canary
kubectl describe pod -n careslot -l app.kubernetes.io/name=backend-canary
```
*"Now a failure: this Deployment points at an image tag that was never built. The Pod is stuck
in ImagePullBackOff, and `describe` shows why - the tag doesn't exist in the registry. The fix
is to point it at a real SHA tag."*
```
kubectl delete -f devops-class-main/Final-Project/troubleshooting/broken-image.yaml
```

---

## Back to the pipeline — steps 6, 7, 8 and the deployment update (≈3 min, M10)

Tab 2 → the run should now be green or on job 3.

- **6. Docker image** — job **2. Build, Trivy scan, push** → steps *Build backend image* /
  *Build frontend image*.
  *"Both images are built in CI; the frontend is a multi-stage build, and both run as non-root
  users."*
- **7. Security scan** — expand **Trivy scan - backend image → Run Trivy** → Report Summary.
  *"Trivy scans both images before they are pushed and fails the pipeline on any HIGH or
  CRITICAL vulnerability. Both are at zero; in docs/TRIVY.md I explain how I removed the
  earlier findings, for example the zlib CVE-2026-85091."*
- **8. Registry** — Tab 3 (GHCR): the newest version tag **is the commit SHA** from step 4.
  *"Images go to GitHub Container Registry, tagged with the commit SHA - never `latest`."*
- **Deploy** — job **3. Deploy to EKS with Helm** → *Show the rollout*.

**The deployment update (the graded moment):**
```
kubectl get pods -n careslot -o custom-columns=POD:.metadata.name,IMAGE:.spec.containers[0].image
```
→ frontend/backend images now end in the **new commit SHA**. Tab 1 → **refresh** → the
dashboard subtitle shows **"· v1.1"**.

*"Helm rolled the new version out with zero downtime, and the change I committed a few
minutes ago is now live on EKS. Commit, pipeline, security scan, registry, deployment - all
automatic."*

## Close (≈20 s)

*"Everything you saw - the app, tests, Dockerfiles, pipeline, Terraform, Helm chart and
monitoring config - is in the public repository, with screenshots for every requirement in
docs/SCREENSHOTS.md. After recording I destroy the AWS environment with Terraform."*

---

## After recording

1. Save the video (keep the original file; note its length).
2. Tell Claude "recorded" → cleanup: helm uninstall, PVC delete, LB/EBS check, `terraform destroy`,
   delete the GitHub secrets, deactivate the IAM access key.
3. Switch kubectl back to the local cluster: `kubectl config use-context minikube`.
