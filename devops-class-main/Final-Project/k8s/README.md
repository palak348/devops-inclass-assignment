# k8s/ — cluster bootstrap manifests

Applied once per cluster, before the application.

| File | Purpose |
|---|---|
| `namespace.yaml` | Namespace `careslot` with Pod Security Admission **`restricted`** enforced and warned |
| `storageclass-gp3.yaml` | **EKS only**: StorageClass `careslot-gp3` (EBS CSI driver, encrypted gp3, `reclaimPolicy: Delete`) for the PostgreSQL volume |

```bash
kubectl apply -f k8s/namespace.yaml                  # minikube and EKS
kubectl apply -f k8s/storageclass-gp3.yaml           # EKS
```
