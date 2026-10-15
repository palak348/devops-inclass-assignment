# Troubleshooting labs

Two deliberately broken manifests for the live "break it and fix it" part of the demo.
Both deploy into the `careslot` namespace next to the healthy app. The outputs below
are from a real run on minikube.

---

## Lab 1 — `broken-image.yaml`: ImagePullBackOff

```bash
kubectl apply -f troubleshooting/broken-image.yaml
```

**Symptom**

```text
$ kubectl get pods -n careslot -l app.kubernetes.io/name=backend-canary
NAME                                       READY   STATUS             RESTARTS   AGE
careslot-backend-canary-76fcd5b75d-pzljr   0/1     ImagePullBackOff   0          26s
```

**Investigate**

```bash
kubectl describe pod -n careslot -l app.kubernetes.io/name=backend-canary   # read the Events section
kubectl get events -n careslot --sort-by=.lastTimestamp
```

```text
Warning  Failed   kubelet  Failed to pull image ".../careslot-backend:1.0.0-relaese":
                           failed to resolve reference ".../careslot-backend:1.0.0-relaese" ...
Warning  Failed   kubelet  Error: ErrImagePull
Normal   BackOff  kubelet  Back-off pulling image ".../careslot-backend:1.0.0-relaese"
```

**Root cause** — the tag `1.0.0-relaese` (typo) was never built or pushed. The kubelet
retries with an increasing back-off: `ErrImagePull` → `ImagePullBackOff`.
(GHCR answers `403 Forbidden` for an image it doesn't have, or that is private and has no
pull secret; a registry that knows the repository answers `not found`.)

**Fix** — point the Deployment at an image that exists. CareSlot images are tagged with
the commit SHA by CI:

```bash
kubectl set image deploy/careslot-backend-canary -n careslot \
  backend=ghcr.io/palak348/devops-inclass-assignment/careslot-backend:<commit-sha>
kubectl rollout status deploy/careslot-backend-canary -n careslot
kubectl delete -f troubleshooting/broken-image.yaml      # clean up
```

Other causes of the same symptom: private image without `imagePullSecrets`, wrong
registry hostname, registry rate limit, no outbound internet from the nodes.

---

## Lab 2 — `broken-service.yaml`: Service with no endpoints

```bash
kubectl apply -f troubleshooting/broken-service.yaml
```

**Symptom** — the Service exists and has a ClusterIP, but every request fails:

```text
$ kubectl run curl-debug ... -- wget -O- http://careslot-backend-debug:8000/health
wget: can't connect to remote host (10.101.30.197): Connection refused
```

**Investigate**

```bash
kubectl get svc careslot-backend-debug -n careslot
kubectl get endpointslices -n careslot -l kubernetes.io/service-name=careslot-backend-debug
kubectl get pods -n careslot --show-labels | grep backend
```

```text
NAME                           ADDRESSTYPE   PORTS     ENDPOINTS   AGE
careslot-backend-debug-l9r2m   IPv4          <unset>   <unset>     26s      <- no Pods behind it

careslot-backend-5747b654f6-4jp65   ...,app.kubernetes.io/name=backend,...
```

**Root cause** — a Service finds its Pods **only by labels**. The selector asks for
`app.kubernetes.io/name: careslot-api`, but the backend Pods are labelled
`app.kubernetes.io/name: backend`. No matching labels → no endpoints → no traffic.

**Fix** — make the selector match the Pod labels:

```bash
kubectl patch svc careslot-backend-debug -n careslot \
  -p '{"spec":{"selector":{"app.kubernetes.io/name":"backend"}}}'
kubectl get endpointslices -n careslot -l kubernetes.io/service-name=careslot-backend-debug   # now lists Pod IPs
kubectl delete -f troubleshooting/broken-service.yaml     # clean up
```

---

## General checklist

| Symptom | First commands |
|---|---|
| Pod `Pending` | `kubectl describe pod` → scheduling events (CPU/memory, unbound PVC) |
| `ImagePullBackOff` | `kubectl describe pod` → image name/tag, registry auth |
| `CrashLoopBackOff` | `kubectl logs <pod> --previous` (CareSlot backend: DB unreachable → see `/ready`) |
| Running but `0/1` ready | readiness probe — `curl /ready` on the backend checks the database |
| Service unreachable | `kubectl get endpointslices`, compare selector with `--show-labels` |
| Ingress 404/503 | `kubectl describe ingress`, check backend Service names/ports, ingress controller running |
| HPA `<unknown>` CPU | metrics-server running? Pods have CPU `requests`? |
