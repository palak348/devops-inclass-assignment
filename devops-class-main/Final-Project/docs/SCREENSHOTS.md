# Screenshot checklist

Every screenshot GRADING.md asks for, with the exact command and the file name to save
it under in `docs/screenshots/`. Commands are run from the `Final-Project` folder unless
noted. Tick them off as you go.

## M1 / M2 / M4 — local (no cloud needed)

| ✔ | File | Module | How |
|---|---|---|---|
| ☐ | `m2-pytest.png` | M2 | `cd backend` → `.venv\Scripts\python -m pytest -v` → all **25 passed** visible |
| ☐ | `m4-compose-up.png` | M4 | `docker compose up --build` → wait for `Uvicorn running on http://0.0.0.0:8000` |
| ☐ | `m1-app-dashboard.png` | M1, M4 | http://localhost:3000 → register a patient, book an appointment → Dashboard |
| ☐ | `m1-app-mobile.png` *(optional)* | M1 | Browser DevTools (F12) → device toolbar → phone size → shows the responsive layout |
| ☐ | `m1-swagger.png` | M1 | http://localhost:8000/docs |

## M3 / M5 / M6 — GitHub (after you push)

| ✔ | File | Module | How |
|---|---|---|---|
| ☐ | `m3-commits.png` | M3 | GitHub → repo → **Commits**, or `git log --oneline -20` (≥10 commits) |
| ☐ | `m5-pipeline-green.png` | M5 | **Actions** → "Final Project - CareSlot CI/CD" → green run. Also copy the run URL into the submission form |
| ☐ | `m6-trivy.png` | M6 | Open that run → job "2. Build, Trivy scan, push" → expand **Trivy scan - backend image** |
| ☐ | `m5-ghcr-packages.png` | M5 | GitHub profile → **Packages** → `careslot-backend` → shows the tag = commit SHA |

## M8 / M9 — Kubernetes on minikube

One-time: add `127.0.0.1 careslot.local` to `C:\Windows\System32\drivers\etc\hosts`
(Notepad as Administrator) and run `minikube tunnel` in an Administrator PowerShell
(leave it open).

| ✔ | File | Module | How |
|---|---|---|---|
| ☐ | `m8-get-pods.png` | M8 | `kubectl get pods -n careslot` → all `Running` (2 backend, 2 frontend, postgres) |
| ☐ | `m8-get-svc.png` | M8 | `kubectl get svc,ingress,hpa -n careslot` |
| ☐ | `m8-helm-list.png` | M8 | `helm list -n careslot` |
| ☐ | `m8-ingress-browser.png` | M8 | Browser → **http://careslot.local** (address bar visible) |
| ☐ | `m8-hpa-scaling.png` | M8 | Terminal 1: `kubectl get hpa -n careslot -w` · Terminal 2: `bash scripts/load-test.sh 180 30` → REPLICAS going 2 → 6 |
| ☐ | `m9-metrics.png` | M9 | `kubectl port-forward -n careslot svc/careslot-backend 8000:8000` then `curl http://localhost:8000/metrics` |
| ☐ | `m9-prometheus-targets.png` | M9 | `kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090` → http://localhost:9090/targets → `serviceMonitor/careslot/careslot-backend/0` **UP** |
| ☐ | `m9-grafana.png` | M9 | `kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80` → http://localhost:3001 → Dashboards → **CareSlot - API Overview** (run the load test first so the panels move). Password: `kubectl get secret grafana-admin -n monitoring -o jsonpath="{.data.admin-password}"` and base64-decode it |

## M7 — AWS (during the EKS session, before destroy)

| ✔ | File | Module | How |
|---|---|---|---|
| ☐ | `m7-terraform-plan.png` | M7 | `terraform plan -out tfplan` → the `Plan: N to add, 0 to change, 0 to destroy` line |
| ☐ | `m7-aws-vpc.png` | M7 | AWS Console, region **Asia Pacific (Mumbai)** → VPC → `careslot-vpc` and its 4 subnets |
| ☐ | `m7-aws-eks.png` | M7 | AWS Console → EKS → `careslot-eks` **Active**, Compute tab shows the node group |
| ☐ | `m10-eks-deploy.png` | M10 | Actions run where job "3. Deploy to EKS with Helm" is green |
| ☐ | `m7-terraform-destroy.png` | M7 | `terraform destroy` → `Destroy complete! Resources: N destroyed.` |
