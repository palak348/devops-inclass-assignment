# Task 4 — Ingress vs Ingress Controller

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

Session 12 — Kubernetes Ingress, ConfigMaps & Secrets

---

## What is Ingress?

An **Ingress** is a Kubernetes API object that describes **rules** for routing external
HTTP/HTTPS traffic to Services inside the cluster.

It is **configuration, not software**. Creating an Ingress object does not start a proxy,
open a port or move a single packet — it writes a set of rules into etcd and waits for
something to act on them.

An Ingress can express:

- **Host-based routing** — `app-one.local` → one Service, `app-two.local` → another
- **Path-based routing** — `/one` → one Service, `/two` → another
- **TLS termination** — which certificate (from a Secret) to serve for which host
- **A default backend** — where to send anything that matches no rule

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: demo-ingress
  namespace: session12
spec:
  ingressClassName: nginx          # WHICH controller should act on this
  rules:
    - host: app-one.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app-one-svc
                port:
                  number: 80
```

Read it as a request: *"whoever implements the `nginx` IngressClass, please send
`app-one.local` traffic to `app-one-svc:80`."*

---

## What is an Ingress Controller?

An **Ingress Controller** is the **actual running software** — a reverse proxy in a Pod —
that watches Ingress objects and implements them.

It runs a control loop:

1. Watch the Kubernetes API for Ingress, Service and EndpointSlice objects.
2. Translate every Ingress rule into its own native proxy configuration.
3. Reload or hot-apply that configuration.
4. Receive real traffic on its own ports and proxy it to the right Pods.

In this cluster the controller is **ingress-nginx**, installed by the Minikube addon:

```bash
kubectl get pods -n ingress-nginx
```

```
NAME                                       READY   STATUS      RESTARTS   AGE
ingress-nginx-admission-create-zw8jn       0/1     Completed   0          71s
ingress-nginx-admission-patch-pggnr        0/1     Completed   2          71s
ingress-nginx-controller-d7cd8c989-r7kq8   1/1     Running     0          71s
```

It is an ordinary Pod. It needs its own Service to receive traffic:

```bash
kubectl get svc -n ingress-nginx
```

```
NAME                       TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)                      AGE
ingress-nginx-controller   NodePort   10.111.138.40   <none>        80:32658/TCP,443:31271/TCP   71s
```

Note the recursion: the thing that routes traffic is itself exposed by a NodePort Service.
In production this would be a LoadBalancer Service with a real public IP.

The controller advertises which IngressClass it implements:

```bash
kubectl get ingressclass
```

```
NAME              CONTROLLER             PARAMETERS   AGE
nginx (default)   k8s.io/ingress-nginx   <none>       71s
```

---

## Difference between them

| | **Ingress** | **Ingress Controller** |
|---|---|---|
| **What it is** | An API object (YAML) | Running software (a Pod) |
| **Role** | Declares *what* routing should happen | Makes it actually happen |
| **Analogy** | A recipe | The chef |
| **Created by** | You, per application | Cluster admin, once |
| **How many** | Many — one or more per app | Usually one (sometimes a few) |
| **Lives in** | Your application namespace | Its own namespace (`ingress-nginx`) |
| **Handles traffic** | **No** | **Yes** — packets flow through it |
| **Has an IP/port** | No | Yes (via its own Service) |
| **Built into Kubernetes** | **Yes** — a standard API type | **No** — must be installed separately |
| **Implementations** | One standard spec | nginx, Traefik, HAProxy, Istio, Kong, AWS ALB, … |
| **Inspect with** | `kubectl get ingress` | `kubectl get pods -n ingress-nginx` |

The cleanest way to put it:

> **Ingress is the rule. The Ingress Controller is the thing that enforces it.**

---

## Why both are required

Kubernetes deliberately separates the two so that the **API stays portable** while the
**implementation stays pluggable**.

### What happens with an Ingress but no Controller

The object is created and accepted — and nothing happens:

```
NAME           CLASS   HOSTS           ADDRESS   PORTS   AGE
demo-ingress   nginx   app-one.local             80      5m
```

The `ADDRESS` column stays **empty forever**. No proxy exists, so no IP is ever assigned
and no traffic is served. This is one of the most common beginner problems: the YAML is
perfect, `kubectl get ingress` looks fine, and the site is unreachable — because nothing
was ever installed to implement it.

Once the controller is running, it fills in the address:

```
NAME           CLASS   HOSTS                                    ADDRESS        PORTS   AGE
demo-ingress   nginx   app-one.local,app-two.local,demo.local   192.168.49.2   80      87s
```

### What happens with a Controller but no Ingress

The proxy runs but has no rules, so every request hits the default backend:

```
HTTP 404
```

(Exactly what `curl -H 'Host: unknown.local'` returned in Task 3 — a host with no matching
rule.)

### Why the split is a good design

| Reason | Explanation |
|---|---|
| **Portability** | The same Ingress YAML works on Minikube with nginx, on AWS with an ALB controller and on-prem with Traefik. Only the controller changes. |
| **Separation of concerns** | Developers write routing rules; platform teams own the proxy, its scaling and its TLS. |
| **Choice** | Different controllers offer different features — Istio for mesh, Kong for API management, ALB for native AWS integration. |
| **No bloat in Kubernetes** | Kubernetes does not ship a production proxy, so it never has to maintain one or pick a winner. |
| **Multiple controllers** | A cluster can run several side by side, selected per-Ingress via `ingressClassName` — e.g. an internal and an external controller. |

### How they find each other

The link is **`ingressClassName`**:

```
Ingress (demo-ingress)              IngressClass (nginx)           Controller Pod
  spec:                               spec:                          ingress-nginx-controller
    ingressClassName: nginx  ───────>   controller:        ───────>  watches, configures nginx
                                          k8s.io/ingress-nginx
```

An Ingress with `ingressClassName: traefik` is simply **ignored** by the nginx controller.
Omitting it means the cluster's *default* class is used — here, `nginx (default)`.

### Full request path

```
  Browser / curl
    │  Host: app-one.local
    ▼
  NodePort 32658  (ingress-nginx-controller Service)
    │
    ▼
  ingress-nginx-controller Pod
    │  nginx.conf generated from the Ingress object
    │  matched: host app-one.local, path /
    ▼
  app-one-svc  (ClusterIP 10.110.167.1)
    │  kube-proxy DNAT
    ▼
  app-one Pods  (10.244.0.102:80, 10.244.0.105:80)
```

The Ingress object is **not on this path**. It only told the controller how to build its
config. Once the proxy config exists, traffic flows through the controller Pod, not through
the API object.

---

## Examples

### Popular Ingress Controllers

| Controller | Based on | Best for |
|---|---|---|
| **ingress-nginx** | NGINX | The default choice; what this session uses |
| **Traefik** | Traefik | Auto TLS via Let's Encrypt, good dashboard |
| **HAProxy Ingress** | HAProxy | High performance, fine-grained load balancing |
| **Istio Gateway** | Envoy | When you already run a service mesh |
| **Kong** | NGINX + Lua | API gateway features — auth, rate limiting, plugins |
| **AWS Load Balancer Controller** | AWS ALB | EKS; provisions a real ALB per Ingress |
| **GKE Ingress** | Google Cloud LB | GKE; native Google Cloud load balancers |
| **Contour** | Envoy | Advanced routing with its own HTTPProxy CRD |

### Example 1 — Host-based routing (verified in Task 3)

```yaml
rules:
  - host: app-one.local
    http:
      paths:
        - path: /
          pathType: Prefix
          backend: { service: { name: app-one-svc, port: { number: 80 } } }
  - host: app-two.local
    http:
      paths:
        - path: /
          pathType: Prefix
          backend: { service: { name: app-two-svc, port: { number: 80 } } }
```

```bash
curl -H 'Host: app-one.local' http://localhost:32658/
curl -H 'Host: app-two.local' http://localhost:32658/
```

```
<h1>APP ONE</h1><p>served by app-one-5668b7cc58-8lzwv</p>
<h1>APP TWO</h1><p>served by app-two-5c7ddb9774-rnxgs</p>
```

### Example 2 — Path-based routing (verified in Task 3)

```yaml
annotations:
  nginx.ingress.kubernetes.io/rewrite-target: /$2
rules:
  - host: demo.local
    http:
      paths:
        - path: /one(/|$)(.*)
          pathType: ImplementationSpecific
          backend: { service: { name: app-one-svc, port: { number: 80 } } }
```

```bash
curl -H 'Host: demo.local' http://localhost:32658/one
```

```
<h1>APP ONE</h1><p>served by app-one-5668b7cc58-8lzwv</p>
```

### Example 3 — TLS termination

```yaml
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - secure.example.com
      secretName: tls-cert      # a Secret of type kubernetes.io/tls
  rules:
    - host: secure.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: app-svc, port: { number: 80 } } }
```

The controller terminates HTTPS and forwards plain HTTP to the Pod — so the application
does not have to handle certificates at all. This is also where ConfigMaps and Secrets tie
back in: the certificate lives in a Secret.

### Example 4 — Controller-specific annotations

Annotations are how features beyond the standard spec are reached, and they are
**controller-specific**:

```yaml
annotations:
  nginx.ingress.kubernetes.io/rewrite-target: /$2
  nginx.ingress.kubernetes.io/ssl-redirect: "true"
  nginx.ingress.kubernetes.io/proxy-body-size: "50m"
  nginx.ingress.kubernetes.io/rate-limit: "100"
```

These only work with ingress-nginx. Traefik uses `traefik.ingress.kubernetes.io/...`. This
annotation sprawl is the main weakness of the Ingress API and is exactly what the newer
**Gateway API** was designed to replace.

---

## Summary

| Question | Answer |
|---|---|
| What is Ingress? | A Kubernetes API object holding HTTP routing rules |
| What is an Ingress Controller? | The proxy Pod that reads those rules and serves the traffic |
| What is the difference? | Ingress = the *what* (declaration); Controller = the *how* (implementation) |
| Why are both needed? | Rules without a proxy do nothing; a proxy without rules has nothing to serve |
| How are they linked? | Via `ingressClassName` → IngressClass → controller |
| How do I know the controller is working? | `kubectl get ingress` shows a populated `ADDRESS` column |
