# Screenshot checklist

Every screenshot GRADING.md asks for, with the exact command and the file name to save
it under in `docs/screenshots/`. Commands are run from the `Final-Project` folder unless
noted. Tick them off as you go.

## M1 / M2 / M4 — local (no cloud needed)

| ✔ | File | Module | How |
|---|---|---|---|
| ☑ | `m2-pytest.png` | M2 | `cd backend` → `.venv\Scripts\python -m pytest -v` → all **45 passed** visible |
| ☑ | `m4-compose-up.png` | M4 | `docker compose up --build` → wait for `Uvicorn running on http://0.0.0.0:8000` |
| ☑ | `m1-app-dashboard.png` | M1, M4 | http://localhost:3000 → register a patient, book an appointment → Dashboard |
| ☑ | `m1-app-mobile.png` | M1 | Browser DevTools (F12) → device toolbar → phone size → shows the responsive layout |
| ☑ | `m1-swagger.png` | M1 | http://localhost:8000/docs |

## M3 / M5 / M6 — GitHub (after you push)

| ✔ | File | Module | How |
|---|---|---|---|
| ☑ | `m3-commits.png` | M3 | GitHub → repo → **Commits**, or `git log --oneline -20` (≥10 commits) |
| ☑ | `m5-pipeline-green.png` | M5 | **Actions** → "Final Project - CareSlot CI/CD" → green run. Also copy the run URL into the submission form |
| ☑ | `m6-trivy-backend.png`, `m6-trivy-frontend.png` | M6 | Open the run → job "2. Build, Trivy scan, push" → expand each **Trivy scan** step → expand **Run Trivy** → the **Report Summary** table must be visible |
| ☑ | `m5-ghcr-packages-frontend.png` | M5 | Same page for `careslot-frontend` (both images published with SHA tags) |
| ☑ | `m5-ghcr-packages.png` | M5 | GitHub profile → **Packages** → `careslot-backend` → shows the tag = commit SHA |

## M8 / M9 — Kubernetes on minikube

One-time: add `127.0.0.1 careslot.local` to `C:\Windows\System32\drivers\etc\hosts`
(Notepad as Administrator) and run `minikube tunnel` in an Administrator PowerShell
(leave it open).

| ✔ | File | Module | How |
|---|---|---|---|
| ☑ | `m8-get-pods.png` | M8 | `kubectl get pods -n careslot` → all `Running` (2 backend, 2 frontend, postgres) |
| ☑ | `m8-get-svc.png` | M8 | `kubectl get svc,ingress,hpa -n careslot` |
| ☑ | `m8-helm-list.png` | M8 | `helm list -n careslot` |
| ☑ | `m8-ingress-browser.png` → covered by `m8-eks-browser.png` | M8 | Rubric: "Ingress hostname **or LoadBalancer IP**" - the EKS screenshot shows the app through the AWS load balancer in front of the Ingress. Optional extra on minikube: hosts entry `127.0.0.1 careslot.local` + `minikube tunnel` → http://careslot.local |
| ☑ | `m8-hpa-scaling.png` | M8 | Terminal 1: `kubectl get hpa -n careslot -w` · Terminal 2: `bash scripts/load-test.sh 180 30` → REPLICAS going 2 → 6 |
| ☑ | `m9-metrics.png` | M9 | `kubectl port-forward -n careslot svc/careslot-backend 18000:8000` then `curl.exe -s http://localhost:18000/metrics | Select-String "http_request"` (8000 is taken by docker compose) |
| ☑ | `m9-prometheus-targets.png` | M9 | `kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090` → http://localhost:9090/targets → `serviceMonitor/careslot/careslot-backend/0` **UP** |
| ☑ | `m9-grafana.png` | M9 | `kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80` → http://localhost:3001 → Dashboards → **CareSlot - API Overview** (run the load test first so the panels move). Password: `kubectl get secret grafana-admin -n monitoring -o jsonpath="{.data.admin-password}"` and base64-decode it |

## M7 — AWS (during the EKS session, before destroy)

| ✔ | File | Module | How |
|---|---|---|---|
| ☑ | `m7-terraform-plan.png` | M7 | `terraform plan -out tfplan` → the `Plan: N to add, 0 to change, 0 to destroy` line |
| ☑ | `m7-aws-vpc.png` | M7 | AWS Console, region **Asia Pacific (Mumbai)** → VPC → `careslot-vpc` and its 4 subnets |
| ☑ | `m7-aws-eks.png` | M7 | AWS Console → EKS → `careslot-eks` overview: **Active**, Kubernetes **1.36**, region Mumbai visible |
| ☑ | `m7-aws-eks-nodegroup.png` | M7 | EKS → `careslot-eks` → Compute → **Node groups**: Active, desired size 2 (the *Nodes* tab says "Unauthorized" for the root user - expected, see below) |
| ☑ | `m8-eks-browser.png` | M8 | The app opened through the AWS load balancer hostname (address bar visible) |
| ☑ | `m10-eks-deploy.png` | M10 | First EKS deploy (earlier Helm-based job 3, before the switch to GitOps) |
| ☑ | `m5-pipeline-gitops.png` | M5 | GitOps run: test → build → Trivy → GHCR → bot commit → **Argo CD deployed … to EKS, Synced / Healthy** |
| ☑ | `m7-terraform-destroy.png` | M7 | `terraform destroy` → `Destroy complete! Resources: N destroyed.` |

> **EKS console "Nodes" tab shows "Error loading resources - Unauthorized"** when signed in as
> the root user. Kubernetes only admits identities with an EKS access entry, and Terraform
> grants one to the cluster creator (`careslot-admin`) only. The *Node groups* tab uses the AWS
> API and works - use that one for the screenshot.

## Demo day on EKS (do NOT skip)

M8's rubric says "a Kubernetes cluster", so the minikube screenshots above are valid. The
README flow (Terraform → Kubernetes → Helm → Ingress → …) implies the AWS cluster too, so
while EKS is up for the live demo, also capture the same evidence **from EKS**:

| ✔ | File | How (kubectl pointed at EKS: `aws eks update-kubeconfig --region ap-south-1 --name careslot-eks`) |
|---|---|---|
| ☑ | `m8-eks-get-pods.png` | `kubectl get pods -n careslot -o wide` - Pods on the EKS nodes, images tagged with the commit SHA |
| ☑ | `m8-eks-get-svc.png` | `kubectl get svc,ingress,hpa -n careslot` - Ingress ADDRESS = the AWS load balancer |
| ☑ | `m8-eks-helm-list.png` | `helm list -A` (platform charts) + `kubectl get application careslot -n argocd` - on EKS the app itself is deployed by Argo CD, so `helm list -n careslot` is empty by design |
| — | (video) | Presentation video **not submitted** (student's decision; GRADING.md: no video = 0 points for M10). The walkthrough script remains in `docs/DEMO-SCRIPT.md` |

Order on the day: `terraform apply` → `kubectl apply -f k8s/namespace.yaml -f k8s/storageclass-gp3.yaml` →
install ingress-nginx, metrics-server, monitoring (README §9) → push a commit (CI deploys) →
screenshots + live demo → cleanup (README §9 / terraform/README.md "Destroy") →
delete the two GitHub secrets and deactivate the `careslot-admin` access key in IAM.
