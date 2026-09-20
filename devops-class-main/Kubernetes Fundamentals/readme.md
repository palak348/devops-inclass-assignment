# Kubernetes Fundamentals

## Student Information

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

---

## Objective

The objective of this practical is to understand the fundamentals of
Kubernetes — what it is, why it is used, and how its core components fit
together to run containerised workloads.

The exercises cover:

- Understanding container orchestration and the need for Kubernetes
- Kubernetes architecture: control plane and worker nodes
- Core components: API server, etcd, scheduler, controller manager, kubelet, kube-proxy
- Setting up a local cluster (Minikube / kind)
- Working with `kubectl` and the cluster context
- Understanding namespaces and basic cluster objects

---

## Topics Covered

| # | Topic |
|---|---|
| 1 | Container orchestration overview |
| 2 | Kubernetes architecture |
| 3 | Control plane components |
| 4 | Node components |
| 5 | Cluster setup with Minikube |
| 6 | `kubectl` basics |
| 7 | Namespaces |

---

## Commands

```bash
# Start a local cluster
minikube start

# Check cluster information
kubectl cluster-info

# List the nodes in the cluster
kubectl get nodes

# List all namespaces
kubectl get namespaces

# View the components running in the control plane
kubectl get pods -n kube-system
```

---

## Screenshots

_Screenshots of the command outputs will be added here._

---

## Conclusion

_To be completed after the session._
