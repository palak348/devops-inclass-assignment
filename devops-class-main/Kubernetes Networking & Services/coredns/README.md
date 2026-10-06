# Task 4 — CoreDNS

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

Session 11 — Kubernetes Networking & Services

---

## What is CoreDNS?

**CoreDNS** is a general-purpose, pluggable DNS server written in Go. It is the **default
cluster DNS** for Kubernetes since v1.13 and is a graduated CNCF project.

Its defining feature is that it is built entirely from **plugins** arranged in a chain. A
DNS query enters the chain and each plugin either answers it or passes it along. The
`kubernetes` plugin is what makes it Kubernetes-aware — it watches the API server for
Services and Endpoints and serves DNS records from that live data.

It runs in this cluster as an ordinary Deployment:

```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide
```

```
NAME                       READY   STATUS    RESTARTS   AGE     IP           NODE
coredns-559f6c778d-nkrkr   1/1     Running   0          5d23h   10.244.0.2   minikube
```

```bash
kubectl get svc kube-dns -n kube-system
```

```
NAME       TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)                  AGE
kube-dns   ClusterIP   10.96.0.10   <none>        53/UDP,53/TCP,9153/TCP   5d23h
```

| Port | Purpose |
|---|---|
| 53/UDP | Standard DNS queries |
| 53/TCP | DNS over TCP, for responses larger than 512 bytes |
| 9153/TCP | Prometheus metrics |

The Service is still named `kube-dns` so that existing Pods, which have `10.96.0.10`
baked into `/etc/resolv.conf`, keep working. The name is historical; the software is CoreDNS.

---

## Why Kubernetes uses CoreDNS

CoreDNS replaced the original **kube-dns**, which was three containers (`kubedns`,
`dnsmasq`, `sidecar`) glued together.

| | kube-dns (old) | CoreDNS (current) |
|---|---|---|
| Containers per Pod | 3 | **1** |
| Language | Go + C (dnsmasq) | Go |
| Configuration | Flags, hard to extend | **Corefile**, plugin-based |
| Known CVEs | dnsmasq had several | Smaller attack surface |
| Extensibility | Very limited | ~40 plugins, custom plugins possible |
| Memory | Higher | Lower |

The reasons it won:

1. **Single process** — one container instead of three, so fewer moving parts and fewer
   failure modes.
2. **Security** — dropping `dnsmasq` (a C codebase with a history of CVEs) removed a real
   attack surface.
3. **Flexibility** — behaviour is changed by editing a ConfigMap, not by patching the
   deployment. Stub domains, custom forwarding and rewrites are a few lines.
4. **Correctness** — kube-dns's dnsmasq caching layer caused subtle, hard-to-debug
   staleness bugs.
5. **Governance** — a CNCF project with its own release cycle, not a Kubernetes-internal
   component.

---

## How Service discovery works

CoreDNS does not maintain a zone file. It **watches the Kubernetes API** and answers from
what it currently sees.

```
   1. You create a Service
          │
          ▼
   kube-apiserver  ──── writes to etcd
          │
          │ 2. watch event
          ▼
   CoreDNS (kubernetes plugin)
          │  keeps an in-memory index of Services + EndpointSlices
          │
          │ 3. Pod queries clusterip-svc.session11.svc.cluster.local
          ▼
   answer: 10.103.253.228
```

This is why no registration step exists — creating the Service *is* the registration. The
moment the Service object lands in etcd, CoreDNS can answer for it, typically in well under
a second.

What it serves depends on the Service type:

| Service type | Record returned |
|---|---|
| **ClusterIP** | A record → the single ClusterIP |
| **NodePort** | A record → the ClusterIP (the NodePort is not in DNS) |
| **LoadBalancer** | A record → the ClusterIP |
| **Headless** | A records → **every ready Pod IP** |
| **ExternalName** | **CNAME** → the external hostname |

All three behaviours confirmed in this session:

```bash
# ClusterIP - one address
kubectl exec test-client -n session11 -- nslookup clusterip-svc.session11.svc.cluster.local
```
```
Name:	clusterip-svc.session11.svc.cluster.local
Address: 10.103.253.228
```

```bash
# Headless - all pod addresses
kubectl exec test-client -n session11 -- nslookup headless-svc.session11.svc.cluster.local
```
```
Name:	headless-svc.session11.svc.cluster.local
Address: 10.244.0.92
Name:	headless-svc.session11.svc.cluster.local
Address: 10.244.0.94
Name:	headless-svc.session11.svc.cluster.local
Address: 10.244.0.93
```

```bash
# ExternalName - a CNAME
kubectl exec test-client -n session11 -- nslookup externalname-svc.session11.svc.cluster.local
```
```
externalname-svc.session11.svc.cluster.local	canonical name = www.google.com
Name:	www.google.com
Address: 142.251.151.119
```

Only Pods that are **Ready** appear in the endpoint list, so a Pod failing its readiness
probe is automatically removed from DNS and from Service load balancing.

---

## How DNS queries are resolved

### End to end

```
  Pod (test-client)
    │  1. wget http://clusterip-svc
    │
    │  2. glibc/musl resolver reads /etc/resolv.conf:
    │       nameserver 10.96.0.10
    │       search session11.svc.cluster.local svc.cluster.local cluster.local
    │       options ndots:5
    │
    │  3. fewer than 5 dots -> try each search suffix in order
    ▼
  UDP :53 to 10.96.0.10
    │
    │  4. kube-proxy DNATs the ClusterIP to the CoreDNS Pod IP (10.244.0.2)
    ▼
  CoreDNS -> Corefile plugin chain
    │
    │  5. does the name end in cluster.local?
    │       YES -> kubernetes plugin answers from its API cache
    │       NO  -> forward plugin sends it upstream
    ▼
  Answer -> 10.103.253.228
```

### Inside the plugin chain

Queries are matched against the server block, then run through the plugins in a fixed
order:

```
query -> errors -> health -> ready -> kubernetes -> hosts -> forward -> cache -> answer
                                          │                     │
                            answers *.cluster.local      everything else goes
                            from the API cache           to the upstream resolver
```

### Real query logs

The `log` plugin is enabled in this cluster, so every query is visible:

```bash
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=8
```

```
[INFO] 10.244.0.95:47910 - 17990 "A IN externalname-svc.session11.svc.cluster.local. udp 62 false 512" NOERROR qr,aa,rd 374 4.686213349s
[INFO] 10.244.0.95:47910 - 17990 "A IN www.google.com. udp 32 false 512" NOERROR qr,rd,ra 272 2.183401605s
[INFO] 10.244.0.95:39925 - 3922 "A IN headless-svc.session11.svc.cluster.local. udp 58 false 512" NOERROR qr,aa,rd 226 0.001100415s
[INFO] 10.244.0.95:39925 - 59992 "AAAA IN headless-svc.session11.svc.cluster.local. udp 58 false 512" NOERROR qr,aa,rd 151 0.001580217s
[INFO] 10.244.0.95:47284 - 10771 "A IN kubernetes.default. udp 36 false 512" NXDOMAIN qr,rd,ra 36 4.2053039s
```

Reading one line: source Pod `10.244.0.95`, query ID, record type `A`, the name, the
response code (`NOERROR` / `NXDOMAIN`), flags, response size, and the response time.

Two things worth noticing:

- **`aa` vs `ra`** — `headless-svc...cluster.local` has the `aa` (authoritative answer)
  flag because CoreDNS owns that zone. `www.google.com` has `ra` (recursion available)
  because it was forwarded upstream.
- **Latency** — the in-cluster lookups took **0.0011s**, the forwarded ones **2.18s**.
  Cluster-internal DNS is answered from memory; anything external pays the upstream round
  trip.
- **Every lookup is doubled** — one `A` query and one `AAAA` (IPv6) query. Even in an
  IPv4-only cluster the resolver asks for both.

---

## CoreDNS configuration

CoreDNS is configured by a **Corefile**, stored in a ConfigMap and mounted into the Pod.

```bash
kubectl get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}'
```

```
.:53 {
    log
    errors
    health {
       lameduck 5s
    }
    ready
    kubernetes cluster.local in-addr.arpa ip6.arpa {
       pods insecure
       fallthrough in-addr.arpa ip6.arpa
       ttl 30
    }
    prometheus :9153
    hosts {
       192.168.65.254 host.minikube.internal
       fallthrough
    }
    forward . /etc/resolv.conf {
       max_concurrent 1000
    }
    cache 30 {
       disable success cluster.local
       disable denial cluster.local
    }
    loop
    reload
    loadbalance
}
```

### Line by line

| Directive | What it does |
|---|---|
| `.:53` | Server block: handle **all** zones (`.`) on port 53 |
| `log` | Log every query — not on by default; Minikube enables it |
| `errors` | Log errors |
| `health { lameduck 5s }` | `/health` endpoint; keep reporting healthy for 5s after shutdown starts so in-flight queries finish |
| `ready` | `/ready` endpoint for the readiness probe — only signals ready once plugins have synced |
| `kubernetes cluster.local …` | **The core plugin.** Serves `cluster.local` plus reverse-DNS zones from the Kubernetes API |
| `pods insecure` | Allow `<ip>.<ns>.pod.cluster.local` records without verifying the Pod exists |
| `fallthrough in-addr.arpa ip6.arpa` | If the kubernetes plugin has no answer for a reverse lookup, pass it to the next plugin instead of returning NXDOMAIN |
| `ttl 30` | Records are cacheable for 30 seconds |
| `prometheus :9153` | Expose metrics |
| `hosts { … }` | A static entry — `host.minikube.internal` maps to the host machine. Minikube-specific |
| `forward . /etc/resolv.conf` | Anything not handled above goes to the **node's** upstream DNS servers |
| `max_concurrent 1000` | Cap on simultaneous upstream queries |
| `cache 30` | Cache answers for 30s |
| `disable success/denial cluster.local` | Do **not** cache cluster.local results — the kubernetes plugin is already an in-memory cache, and caching would delay reacting to Pod changes |
| `loop` | Detect infinite forwarding loops and crash on purpose rather than hang |
| `reload` | Watch the ConfigMap and apply changes automatically, roughly every 30s |
| `loadbalance` | Shuffle A records on each response, so clients spread across Pods |

### Changing the configuration

```bash
kubectl edit configmap coredns -n kube-system
```

The `reload` plugin picks the change up within ~30s. To force it immediately:

```bash
kubectl rollout restart deployment coredns -n kube-system
```

### Common customisations

**Forward a specific domain to a different DNS server** (e.g. an internal corporate zone):

```
company.internal:53 {
    errors
    cache 30
    forward . 10.10.0.53
}
```

**Rewrite a name:**

```
rewrite name old-service.default.svc.cluster.local new-service.default.svc.cluster.local
```

**Add static host entries:**

```
hosts {
    192.168.1.50 legacy-server.internal
    fallthrough
}
```

---

## How to troubleshoot DNS issues

### Step 1 — Is CoreDNS running?

```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl get svc kube-dns -n kube-system
```

Expect `1/1 Running` and a ClusterIP of `10.96.0.10`. `CrashLoopBackOff` here breaks DNS
cluster-wide.

### Step 2 — Check the Pod's resolver config

```bash
kubectl exec <pod> -- cat /etc/resolv.conf
```

```
search session11.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
```

A wrong `nameserver` usually means `dnsPolicy` was overridden, or the Pod uses
`hostNetwork: true` without `dnsPolicy: ClusterFirstWithHostNet`.

### Step 3 — Test resolution directly

```bash
kubectl exec <pod> -- nslookup kubernetes.default.svc.cluster.local
```

This name exists in every cluster, so it isolates "DNS is broken" from "my Service name is
wrong".

If you do not have a debug tool in the image, run a throwaway one:

```bash
kubectl run dnsutils --image=busybox:1.36 --restart=Never -it --rm -- sh
```

### Step 4 — Read the CoreDNS logs

```bash
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
```

If `log` is not enabled in the Corefile, add it temporarily.

### Step 5 — Verify the Service and its endpoints

```bash
kubectl get svc <service> -n <namespace>
kubectl get endpoints <service> -n <namespace>
```

```
NAME            ENDPOINTS                                      AGE
clusterip-svc   10.244.0.92:80,10.244.0.93:80,10.244.0.94:80   26s
```

**Empty endpoints is the most common "DNS problem" that is not a DNS problem** — the name
resolves fine, there is simply nothing behind it.

### Common issues and causes

| Symptom | Likely cause | Fix |
|---|---|---|
| `bad address 'my-service'` from another namespace | Short name used across namespaces | Use the FQDN `my-service.other-ns.svc.cluster.local` |
| Name resolves, connection refused | Service has **no endpoints** | Check the selector matches Pod labels; check Pods are Ready |
| `NXDOMAIN` for a correct Service | Typo, or wrong namespace | `kubectl get svc -A \| grep <name>` |
| All DNS fails cluster-wide | CoreDNS down, or NetworkPolicy blocking port 53 | Check CoreDNS Pods; allow egress to `kube-system` on 53 |
| External names fail, internal work | `forward` upstream unreachable | Check the node's `/etc/resolv.conf` |
| DNS is very slow | `ndots:5` causing extra lookups | Use a trailing dot, or set a custom `dnsConfig` |
| CoreDNS in `CrashLoopBackOff` with "Loop detected" | Upstream resolver points back at CoreDNS | Fix the node's resolv.conf; the `loop` plugin crashed it deliberately |

### Endpoints vs DNS — the key distinction

The two failures look identical from the application's point of view but have different
causes:

```bash
# DNS problem - the name does not resolve at all
kubectl exec <pod> -- nslookup my-service
# -> NXDOMAIN / bad address

# Endpoint problem - the name resolves but nothing is behind it
kubectl exec <pod> -- nslookup my-service     # -> returns an IP fine
kubectl get endpoints my-service              # -> ENDPOINTS column is <none>
```

Always run both. Fixing a selector mismatch when you think you have a DNS bug wastes a lot
of time.

### Checking a selector mismatch

```bash
kubectl get svc <service> -o jsonpath='{.spec.selector}'
kubectl get pods --show-labels
```

The Service selector must be a **subset** of the Pod labels. This session's Services select
`app=web-backend`, and the backend Pods carry exactly that label — which is why all three
Pod IPs appear as endpoints.
