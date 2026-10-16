# scripts/

| Script | What it does |
|---|---|
| `smoke-test.sh` | 15 end-to-end API checks through the frontend URL (SPA, probe, create/read/update/delete, double booking → 409, status change, stats) and cleans up its test data |
| `load-test.sh` | Runs a busybox Pod inside the cluster that hammers `/api/stats` so the backend HPA scales out |

```bash
bash scripts/smoke-test.sh                                         # Docker Compose (localhost:3000)
bash scripts/smoke-test.sh http://<load-balancer-host>             # EKS via the Ingress
HOST_HEADER=careslot.local bash scripts/smoke-test.sh http://localhost:18080   # minikube Ingress via port-forward

bash scripts/load-test.sh 180 30      # 180 s, 30 workers; watch: kubectl get hpa -n careslot -w
```
