# Kubernetes Networking & Services

## Student Information

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

---

## Objective

The objective of this practical is to understand how networking works
inside a Kubernetes cluster and how Services expose applications to other
Pods and to the outside world.

The exercises cover:

- The Kubernetes networking model and Pod-to-Pod communication
- Service types: ClusterIP, NodePort, LoadBalancer and ExternalName
- Service discovery using DNS and environment variables
- Labels, selectors and endpoints
- Headless Services
- Testing connectivity between Pods

---

## Topics Covered

| # | Topic |
|---|---|
| 1 | Kubernetes networking model |
| 2 | ClusterIP Service |
| 3 | NodePort Service |
| 4 | LoadBalancer Service |
| 5 | Service discovery and cluster DNS |
| 6 | Labels, selectors and endpoints |
| 7 | Headless Services |

---

## Service Types

| Type | Scope | Typical use |
|---|---|---|
| ClusterIP | Inside the cluster only | Internal service-to-service traffic |
| NodePort | Exposed on every node's IP at a fixed port | Development and testing access |
| LoadBalancer | External load balancer from the cloud provider | Production external access |
| ExternalName | Maps to an external DNS name | Referring to services outside the cluster |

---

## Commands

```bash
# Expose a deployment as a ClusterIP Service
kubectl expose deployment nginx-deploy --port=80 --target-port=80

# Create a NodePort Service
kubectl expose deployment nginx-deploy --type=NodePort --port=80

# List Services and their endpoints
kubectl get services
kubectl get endpoints

# Describe a Service
kubectl describe service nginx-deploy

# Test connectivity from a temporary Pod
kubectl run test --rm -it --image=busybox -- sh
# inside the Pod:
#   wget -qO- http://nginx-deploy
#   nslookup nginx-deploy

# Access a NodePort Service on Minikube
minikube service nginx-deploy --url
```

---

## Screenshots

_Screenshots of the command outputs will be added here._

---

## Conclusion

_To be completed after the session._
