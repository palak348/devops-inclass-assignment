# Argo CD — GitOps deployment to EKS

```text
developer ──git push──► GitHub Actions: test → build → Trivy → push images (tag = SHA)
                                             │
                                             └─ job 3 commits values-eks.yaml with the new SHA
                                                          │  (Git = desired state)
Argo CD on EKS ◄── watches the repo ───────────────────────┘
      │ renders helm/careslot with values-eks.yaml, applies the difference
      ▼
namespace careslot: new Pods with the new images (rolling update, zero downtime)
```

- **Nobody runs `helm` or `kubectl apply` against EKS to deploy.** The only way to change what runs
  is a Git commit; Argo CD keeps the cluster equal to Git (`selfHeal` undoes manual edits,
  `prune` removes what was deleted from Git).
- CI never needs cluster credentials to deploy. With the AWS secrets set, job 3 additionally
  *watches* Argo CD finish, so the Actions run shows the whole flow end to end.

| File | Purpose |
|---|---|
| `argocd-values.yaml` | Install values for chart `argo/argo-cd` **10.10.5** (Argo CD **v3.5.5**): HTTP UI behind port-forward, dex + notifications off |
| `careslot-application.yaml` | The Application: repo `palak348/devops-inclass-assignment`, path `devops-class-main/Final-Project/helm/careslot`, values `values-eks.yaml`, destination namespace `careslot`, automated sync with prune + selfHeal |
| `../helm/careslot/values-eks.yaml` | The desired state: image tags (`# gitops-image-tag`, updated by CI), `existingSecret`, gp3 storage |

## One-time setup on a new EKS cluster

```bash
# kubectl pointed at EKS: aws eks update-kubeconfig --region ap-south-1 --name careslot-eks
kubectl apply -f k8s/namespace.yaml -f k8s/storageclass-gp3.yaml

# Database credentials: created once, random, never stored in Git.
# (Argo CD renders Helm charts with `helm template`, where the chart's `lookup`-based
#  password reuse cannot work - so the GitOps install uses an existing Secret.)
kubectl create secret generic careslot-postgres-credentials -n careslot \
  --from-literal=username=careslot --from-literal=database=careslot \
  --from-literal=password="$(openssl rand -hex 24)"

helm repo add argo https://argoproj.github.io/argo-helm
helm upgrade --install argocd argo/argo-cd --version 10.10.5 \
  -n argocd --create-namespace -f argocd/argocd-values.yaml --wait

kubectl apply -f argocd/careslot-application.yaml
kubectl get application careslot -n argocd        # SYNC STATUS Synced, HEALTH STATUS Healthy
```

Install ingress-nginx, metrics-server and the monitoring stack first (project README §12 and §13) so the
Ingress gets a load balancer, the HPA has CPU metrics and the chart's ServiceMonitor CRD exists.

## Look at it

```bash
kubectl port-forward -n argocd svc/argocd-server 8443:80
# http://localhost:8443  user: admin  password:
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

The UI shows the `careslot` Application **Synced / Healthy**, the tree of Deployments, Pods,
Services, Ingress, HPA, StatefulSet and ServiceMonitor, and the Git commit it is synced to.

## Teardown

```bash
kubectl delete -f argocd/careslot-application.yaml   # finalizer deletes everything the app created
kubectl delete pvc --all -n careslot                 # EBS volume (careslot-gp3: reclaimPolicy Delete)
helm uninstall argocd -n argocd
```
