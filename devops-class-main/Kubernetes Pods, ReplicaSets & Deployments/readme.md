# Kubernetes Pods, ReplicaSets & Deployments

## Student Information

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

---

## Objective

The objective of this practical is to understand the core workload objects
in Kubernetes — Pods, ReplicaSets and Deployments — and how they are used
to run and scale applications.

The exercises cover:

- Creating and inspecting Pods
- Writing Pod manifests in YAML
- Understanding ReplicaSets and how they maintain the desired replica count
- Creating Deployments and managing them declaratively
- Scaling applications up and down
- Performing rolling updates and rollbacks

---

## Topics Covered

| # | Topic |
|---|---|
| 1 | Pods and the Pod lifecycle |
| 2 | Multi-container Pods |
| 3 | ReplicaSets and self-healing |
| 4 | Deployments |
| 5 | Scaling replicas |
| 6 | Rolling updates |
| 7 | Rollbacks and revision history |

---

## Commands

```bash
# Create a Pod imperatively
kubectl run nginx-pod --image=nginx:alpine

# Apply a manifest
kubectl apply -f pod.yaml

# List and describe Pods
kubectl get pods -o wide
kubectl describe pod nginx-pod

# View Pod logs and open a shell
kubectl logs nginx-pod
kubectl exec -it nginx-pod -- sh

# ReplicaSets
kubectl get replicasets

# Deployments
kubectl create deployment nginx-deploy --image=nginx:alpine
kubectl scale deployment nginx-deploy --replicas=5

# Rolling update and rollback
kubectl set image deployment/nginx-deploy nginx=nginx:1.25
kubectl rollout status deployment/nginx-deploy
kubectl rollout history deployment/nginx-deploy
kubectl rollout undo deployment/nginx-deploy

# Clean up
kubectl delete deployment nginx-deploy
```

---

## Screenshots

_Screenshots of the command outputs will be added here._

---

## Conclusion

_To be completed after the session._
