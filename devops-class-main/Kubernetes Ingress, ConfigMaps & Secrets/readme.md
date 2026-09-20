# Kubernetes Ingress, ConfigMaps & Secrets

## Student Information

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

---

## Objective

The objective of this practical is to understand how HTTP traffic is routed
into a cluster using Ingress, and how application configuration and
sensitive data are managed using ConfigMaps and Secrets.

The exercises cover:

- Enabling an Ingress controller and creating Ingress rules
- Host-based and path-based routing
- Creating ConfigMaps from literals, files and manifests
- Consuming ConfigMaps as environment variables and mounted volumes
- Creating Secrets and understanding base64 encoding
- Injecting Secrets into Pods safely

---

## Topics Covered

| # | Topic |
|---|---|
| 1 | Ingress controllers |
| 2 | Ingress rules and path-based routing |
| 3 | Host-based routing |
| 4 | ConfigMaps |
| 5 | Consuming ConfigMaps in Pods |
| 6 | Secrets |
| 7 | Consuming Secrets in Pods |

---

## Commands

### Ingress

```bash
# Enable the Ingress controller on Minikube
minikube addons enable ingress

# Apply an Ingress manifest
kubectl apply -f ingress.yaml

# List and describe Ingress resources
kubectl get ingress
kubectl describe ingress app-ingress
```

### ConfigMaps

```bash
# Create a ConfigMap from literal values
kubectl create configmap app-config --from-literal=APP_ENV=production --from-literal=APP_PORT=8080

# Create a ConfigMap from a file
kubectl create configmap app-config-file --from-file=config.properties

# View a ConfigMap
kubectl get configmaps
kubectl describe configmap app-config
```

### Secrets

```bash
# Create a Secret from literal values
kubectl create secret generic db-secret --from-literal=DB_USER=admin --from-literal=DB_PASSWORD=secret123

# View a Secret
kubectl get secrets
kubectl describe secret db-secret

# Decode a Secret value
kubectl get secret db-secret -o jsonpath='{.data.DB_USER}' | base64 --decode
```

---

## ConfigMaps vs Secrets

| | ConfigMap | Secret |
|---|---|---|
| Purpose | Non-sensitive configuration | Sensitive data such as passwords and tokens |
| Storage | Plain text in etcd | Base64 encoded, can be encrypted at rest |
| Typical data | Environment names, ports, URLs | Credentials, API keys, TLS certificates |

---

## Screenshots

_Screenshots of the command outputs will be added here._

---

## Conclusion

_To be completed after the session._
