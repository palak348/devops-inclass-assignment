# Evidence index

Every artefact the [grading rubric](https://github.com/Nency-Ravaliya/devsecops-python/blob/main/GRADING.md)
asks for, mapped to the screenshot in [`screenshots/`](screenshots) and the command that
produced it. Commands run from `devops-class-main/Final-Project` unless noted.

| Environment | Where the evidence was captured |
|---|---|
| Local | Docker Desktop on Windows 11 (Compose stack) |
| GitHub | Actions runs and GHCR packages of `palak348/devops-inclass-assignment` |
| minikube | Local Kubernetes cluster with the ingress and metrics-server add-ons |
| AWS | EKS cluster `careslot-eks` in `ap-south-1`, created and destroyed with Terraform |

---

## M1 · M2 · M4: application, tests, containers

| Screenshot | Module | Shows | Command / URL |
|---|---|---|---|
| [`m1-app-dashboard.png`](screenshots/m1-app-dashboard.png) | M1, M4 | Dashboard with patients and booked appointments | http://localhost:3000 |
| [`m1-app-mobile.png`](screenshots/m1-app-mobile.png) | M1 | Responsive phone layout | Browser DevTools device toolbar |
| [`m1-swagger.png`](screenshots/m1-swagger.png) | M1 | REST API (Swagger UI) | http://localhost:8000/docs |
| [`m2-pytest.png`](screenshots/m2-pytest.png) | M2 | All 45 tests passing | `cd backend && .venv\Scripts\python -m pytest -v` |
| [`m4-compose-up.png`](screenshots/m4-compose-up.png) | M4 | postgres, backend and frontend starting | `docker compose up --build` |

## M3 · M5 · M6: Git, CI/CD, security

| Screenshot | Module | Shows | Where |
|---|---|---|---|
| [`m3-commits.png`](screenshots/m3-commits.png) | M3 | Commit history (≥ 10 meaningful commits) | GitHub → Commits |
| [`m5-pipeline-green.png`](screenshots/m5-pipeline-green.png) | M5 | Green run: test → build, Trivy scan, push to GHCR (SHA-tagged images listed in the job summary) → deploy job (skipped while no cluster existed) | Run [38849464815](https://github.com/palak348/devops-inclass-assignment/actions/runs/38849464815) |
| [`m5-pipeline-gitops.png`](screenshots/m5-pipeline-gitops.png) | M5 | GitOps run: bot commit → Argo CD **Synced / Healthy** on EKS | Run [38868635806](https://github.com/palak348/devops-inclass-assignment/actions/runs/38868635806) |
| [`m5-ghcr-packages.png`](screenshots/m5-ghcr-packages.png) | M5 | `careslot-backend` in GHCR, tag = commit SHA | GitHub → Packages |
| [`m5-ghcr-packages-frontend.png`](screenshots/m5-ghcr-packages-frontend.png) | M5 | `careslot-frontend` in GHCR, tag = commit SHA | GitHub → Packages |
| [`m6-trivy-backend.png`](screenshots/m6-trivy-backend.png) | M6 | Trivy report for the backend image: 0 vulnerabilities | Job 2 → *Trivy scan - backend image* |
| [`m6-trivy-frontend.png`](screenshots/m6-trivy-frontend.png) | M6 | Trivy report for the frontend image: 0 vulnerabilities | Job 2 → *Trivy scan - frontend image* |

Written explanation of the scan result: [`TRIVY.md`](TRIVY.md).

## M7: Terraform on AWS

| Screenshot | Shows | Command / console page |
|---|---|---|
| [`m7-terraform-plan.png`](screenshots/m7-terraform-plan.png) | `Plan: 53 to add, 0 to change, 0 to destroy` | `terraform plan -out tfplan` |
| [`m7-aws-vpc.png`](screenshots/m7-aws-vpc.png) | `careslot-vpc` with 2 public + 2 private subnets, region Mumbai | VPC console |
| [`m7-aws-eks.png`](screenshots/m7-aws-eks.png) | `careslot-eks` Active, Kubernetes 1.36 | EKS console → Overview |
| [`m7-aws-eks-nodegroup.png`](screenshots/m7-aws-eks-nodegroup.png) | Managed node group Active, desired size 2 | EKS console → Compute → Node groups |
| [`m7-terraform-destroy.png`](screenshots/m7-terraform-destroy.png) | `Destroy complete!` | `terraform destroy` |

The EKS console *Nodes* tab reports "Unauthorized" for the AWS root user: only the cluster
creator (`careslot-admin`) has a Kubernetes access entry. The *Node groups* tab uses the AWS
API and is the one shown.

## M8: Kubernetes and Helm

**EKS (Argo CD / GitOps)**

| Screenshot | Shows | Command |
|---|---|---|
| [`m8-eks-get-pods.png`](screenshots/m8-eks-get-pods.png) | All Pods Running on the EKS nodes, images tagged with the commit SHA | `kubectl get pods -n careslot -o wide` |
| [`m8-eks-get-svc.png`](screenshots/m8-eks-get-svc.png) | ClusterIP Services, Ingress with the AWS load balancer address, HPA | `kubectl get svc,ingress,hpa -n careslot` |
| [`m8-eks-helm-list.png`](screenshots/m8-eks-helm-list.png) | Platform Helm releases and the Argo CD Application | `helm list -A` · `kubectl get application careslot -n argocd` |
| [`m8-eks-browser.png`](screenshots/m8-eks-browser.png) | The application through the AWS load balancer in front of the Ingress | Load balancer hostname |
| [`m8-eks-helm-deploy.png`](screenshots/m8-eks-helm-deploy.png) | First EKS rollout (before the switch to GitOps): `helm upgrade --install` from CI, release revision 1 *deployed* | Run [38802857817](https://github.com/palak348/devops-inclass-assignment/actions/runs/38802857817) |

On EKS the application release is owned by Argo CD, so `helm list -n careslot` is empty by
design; the `helm upgrade --install` evidence comes from minikube and the first EKS rollout.

**minikube (plain Helm)**

| Screenshot | Shows | Command |
|---|---|---|
| [`m8-get-pods.png`](screenshots/m8-get-pods.png) | 2 backend, 2 frontend and the PostgreSQL Pod Running | `kubectl get pods -n careslot` |
| [`m8-get-svc.png`](screenshots/m8-get-svc.png) | Services, Ingress, HPA | `kubectl get svc,ingress,hpa -n careslot` |
| [`m8-helm-list.png`](screenshots/m8-helm-list.png) | Release `careslot` deployed | `helm list -n careslot` |
| [`m8-hpa-scaling.png`](screenshots/m8-hpa-scaling.png) | HPA scaling the backend 2 → 6 under load | `kubectl get hpa -n careslot -w` + `bash scripts/load-test.sh 180 30` |

## M9: Observability

| Screenshot | Shows | Command |
|---|---|---|
| [`m9-metrics.png`](screenshots/m9-metrics.png) | Prometheus-format output of the backend `/metrics` | `kubectl port-forward -n careslot svc/careslot-backend 18000:8000` → `curl http://localhost:18000/metrics` |
| [`m9-prometheus-targets.png`](screenshots/m9-prometheus-targets.png) | `serviceMonitor/careslot/careslot-backend/0` **UP** | `kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090` → `/targets` |
| [`m9-grafana.png`](screenshots/m9-grafana.png) | *CareSlot - API Overview* dashboard with live panels | `kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80` |

## M10: Presentation and documentation

| Artefact | Location |
|---|---|
| Technical documentation | [Repository README](../../../README.md) (incl. known issues and limitations) · [project README](../README.md) |
| Slide deck | [`demo/CareSlot-presentation.pptx`](../demo/CareSlot-presentation.pptx) · [`.pdf`](../demo/CareSlot-presentation.pdf) |
| Presentation video | Not submitted |
