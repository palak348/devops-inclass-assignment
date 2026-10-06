# Task 3 — FQDN (Fully Qualified Domain Name)

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

Session 11 — Kubernetes Networking & Services

---

## What is an FQDN?

A **Fully Qualified Domain Name** is a domain name that specifies a host's exact position
in the DNS hierarchy, read right to left from the root. It is *complete* — there is nothing
for the resolver to guess or append.

```
www.google.com.
│   │      │  └── root (the trailing dot, usually implied)
│   │      └───── top-level domain
│   └──────────── second-level domain
└──────────────── hostname
```

| Term | Example | Meaning |
|---|---|---|
| **Short name** | `clusterip-svc` | Relative — the resolver must append a search domain |
| **Partially qualified** | `clusterip-svc.session11` | Still incomplete |
| **FQDN** | `clusterip-svc.session11.svc.cluster.local` | Complete, unambiguous |

The practical difference: a short name means something different depending on *where* it is
resolved from, while an FQDN always resolves to the same thing.

---

## Kubernetes Service DNS

Every Service automatically gets a DNS record the moment it is created. No registration
step, no configuration — CoreDNS watches the Kubernetes API and serves records for what it
sees.

Every Pod is configured to use the cluster DNS server:

```bash
kubectl exec test-client -n session11 -- cat /etc/resolv.conf
```

```
search session11.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
```

Three things to note:

| Line | Meaning |
|---|---|
| `nameserver 10.96.0.10` | The `kube-dns` Service ClusterIP — all DNS queries go here |
| `search …` | Suffixes tried automatically for short names, **in order** |
| `options ndots:5` | Names with fewer than 5 dots are tried with the search suffixes first |

`10.96.0.10` is the CoreDNS Service:

```bash
kubectl get svc kube-dns -n kube-system
```

```
NAME       TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)                  AGE
kube-dns   ClusterIP   10.96.0.10   <none>        53/UDP,53/TCP,9153/TCP   5d23h
```

The Service is still called `kube-dns` for backwards compatibility even though CoreDNS
replaced kube-dns years ago.

---

## Kubernetes DNS naming convention

### For Services

```
<service-name>.<namespace>.svc.<cluster-domain>
```

```
clusterip-svc . session11 . svc . cluster.local
      │             │         │         │
      │             │         │         └── cluster domain (default: cluster.local)
      │             │         └──────────── "svc" = this is a Service record
      │             └────────────────────── namespace
      └──────────────────────────────────── Service name
```

| Record | Resolves to |
|---|---|
| `clusterip-svc.session11.svc.cluster.local` | `10.103.253.228` (the ClusterIP) |
| `headless-svc.session11.svc.cluster.local` | `10.244.0.92`, `.93`, `.94` (all Pod IPs) |
| `externalname-svc.session11.svc.cluster.local` | CNAME → `www.google.com` |

### For Pods

```
<pod-ip-with-dashes>.<namespace>.pod.<cluster-domain>
```

So Pod `10.244.0.92` is `10-244-0-92.session11.pod.cluster.local`. Rarely used directly,
because the IP is already in the name.

### For StatefulSet Pods (via a headless Service)

```
<pod-name>.<headless-service>.<namespace>.svc.<cluster-domain>
```

```
mysql-0.mysql-headless.default.svc.cluster.local
mysql-1.mysql-headless.default.svc.cluster.local
```

This is the **only** way to address one specific replica by name, and it is why
StatefulSets are always paired with a headless Service.

### SRV records for named ports

```
_<port-name>._<protocol>.<service>.<namespace>.svc.cluster.local
```

e.g. `_http._tcp.clusterip-svc.session11.svc.cluster.local` returns both the port number
and the hostname — used by service meshes and older service-discovery clients.

---

## Namespace-based DNS

The namespace sits in the middle of the FQDN, which is what makes namespaces a real
isolation boundary for name resolution. Two different namespaces can both have a Service
called `api` and they never collide:

```
api.frontend.svc.cluster.local     <- the frontend team's API
api.backend.svc.cluster.local      <- the backend team's API
```

### Short names only work within the same namespace

Because of the `search` list, a short name is resolved **relative to the calling Pod's
namespace**. Demonstrated directly:

**From `test-client`, which is in `session11`:**

```bash
kubectl exec test-client -n session11 -- wget -qO- http://clusterip-svc
```

```
Hello from pod web-backend-5b96f69d45-r9stw
```

**From `tmp-client`, which is in `default`:**

```bash
kubectl exec tmp-client -n default -- wget -qO- --timeout=5 http://clusterip-svc
```

```
wget: bad address 'clusterip-svc'
command terminated with exit code 1
```

**Same command, same Service, different namespace — it fails.** The `default` Pod's search
list is `default.svc.cluster.local svc.cluster.local cluster.local`, so it tries
`clusterip-svc.default.svc.cluster.local`, which does not exist.

Using the FQDN instead works from anywhere:

```bash
kubectl exec tmp-client -n default -- wget -qO- http://clusterip-svc.session11.svc.cluster.local
```

```
Hello from pod web-backend-5b96f69d45-x4b4r
```

**This is the single most common cause of "service not found" errors in Kubernetes.**

---

## Pod-to-Service communication

### The search domain walk

When a Pod resolves a short name, the resolver appends each `search` suffix in turn until
one succeeds. This is visible in a real `nslookup`:

```bash
kubectl exec test-client -n session11 -- nslookup clusterip-svc
```

```
Server:		10.96.0.10
Address:	10.96.0.10:53

** server can't find clusterip-svc.cluster.local: NXDOMAIN

Name:	clusterip-svc.session11.svc.cluster.local
Address: 10.103.253.228

** server can't find clusterip-svc.svc.cluster.local: NXDOMAIN
```

Three queries for one lookup — two NXDOMAINs and one hit. The `NXDOMAIN` lines are **not
errors**; they are the resolver working through the search list. Only
`clusterip-svc.session11.svc.cluster.local` exists, and that returns the ClusterIP.

### Why `ndots:5` matters

`options ndots:5` means: *if the name has fewer than 5 dots, try the search suffixes
before trying it as an absolute name.*

- `clusterip-svc` → 0 dots → search list first ✅
- `clusterip-svc.session11` → 1 dot → search list first ✅
- `clusterip-svc.session11.svc.cluster.local` → 4 dots → **still** search list first ⚠️
- `clusterip-svc.session11.svc.cluster.local.` → trailing dot → absolute, no search

The side effect: even a full FQDN costs extra failed lookups unless you add a trailing dot.
For external domains like `api.github.com` (2 dots) this means 3 wasted queries before the
real one. In high-traffic clusters this is a known performance issue, fixed by adding a
trailing dot or setting a custom `dnsConfig` with a lower `ndots`.

### All four forms work from the same namespace

```bash
kubectl exec test-client -n session11 -- wget -qO- http://clusterip-svc
kubectl exec test-client -n session11 -- wget -qO- http://clusterip-svc.session11
kubectl exec test-client -n session11 -- wget -qO- http://clusterip-svc.session11.svc.cluster.local
```

```
Hello from pod web-backend-5b96f69d45-r9stw
Hello from pod web-backend-5b96f69d45-x4b4r
Hello from pod web-backend-5b96f69d45-x4b4r
```

All three resolve to the same ClusterIP. They differ only in how many failed lookups happen
first, and in whether they work from another namespace.

### Full request path

```
  test-client Pod
      │
      │ 1. wget http://clusterip-svc
      ▼
  resolver reads /etc/resolv.conf -> nameserver 10.96.0.10
      │
      │ 2. query clusterip-svc.session11.svc.cluster.local
      ▼
  CoreDNS (10.96.0.10)  -> answers 10.103.253.228
      │
      │ 3. TCP connect to 10.103.253.228:80
      ▼
  kube-proxy iptables rule DNATs to a random endpoint
      │
      ▼
  10.244.0.92:80  (nginx Pod)
```

---

## Examples of Kubernetes FQDNs

| FQDN | What it is |
|---|---|
| `kubernetes.default.svc.cluster.local` | The Kubernetes API server itself — reachable from every Pod |
| `kube-dns.kube-system.svc.cluster.local` | CoreDNS |
| `clusterip-svc.session11.svc.cluster.local` | This session's ClusterIP Service |
| `headless-svc.session11.svc.cluster.local` | Headless — returns all Pod IPs |
| `mysql-0.mysql-headless.default.svc.cluster.local` | One specific StatefulSet replica |
| `10-244-0-92.session11.pod.cluster.local` | A Pod addressed by IP-derived name |
| `_http._tcp.clusterip-svc.session11.svc.cluster.local` | SRV record for a named port |

Verifying the API server FQDN, which exists in every cluster:

```bash
kubectl exec test-client -n session11 -- nslookup kubernetes.default.svc.cluster.local
```

```
Server:		10.96.0.10
Address:	10.96.0.10:53

Name:	kubernetes.default.svc.cluster.local
Address: 10.96.0.1
```

`10.96.0.1` is the first address of the Service CIDR and is always the API server.

---

## Practical rules

1. **Within one namespace** — use the short name. It is readable and works.
2. **Across namespaces** — use at least `service.namespace`, ideally the full FQDN.
3. **In config files, Helm charts and anything shared** — always use the full FQDN; it is
   unambiguous no matter which namespace it is deployed into.
4. **Debugging "host not found"** — check the caller's namespace first. It is almost always
   a short name used across a namespace boundary.
5. **Performance-sensitive external lookups** — add a trailing dot (`api.github.com.`) to
   skip the search-domain walk.
