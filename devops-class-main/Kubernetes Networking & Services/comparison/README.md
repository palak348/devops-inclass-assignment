# Task 2 — Kubernetes Object Comparison

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

Session 11 — Kubernetes Networking & Services

---

# 1. Deployment vs ReplicaSet

## Purpose

| | Deployment | ReplicaSet |
|---|---|---|
| **Purpose** | Declarative management of a *versioned* application — handles updates and rollbacks | Keep exactly N identical Pods running at all times |
| **Abstraction level** | Higher — manages ReplicaSets | Lower — manages Pods |
| **Created by** | You | Usually a Deployment, on your behalf |

A ReplicaSet answers one question: *"are there N healthy Pods?"* It has no concept of
versions. A Deployment adds the version dimension on top — it creates a **new ReplicaSet
for every change to the Pod template** and shifts replicas between them.

## Pod management

Both use a **label selector** to decide which Pods they own, and both rely on
`ownerReferences` for garbage collection. The real ownership chain, taken from the live
cluster:

```bash
kubectl get pod web-backend-5b96f69d45-r9stw -n session11 \
  -o jsonpath='{.metadata.ownerReferences[0].kind}/{.metadata.ownerReferences[0].name}'
```

```
ReplicaSet/web-backend-5b96f69d45
```

```bash
kubectl get rs web-backend-5b96f69d45 -n session11 \
  -o jsonpath='{.metadata.ownerReferences[0].kind}/{.metadata.ownerReferences[0].name}'
```

```
Deployment/web-backend
```

So the chain is:

```
Deployment  web-backend
     │  owns
     ▼
ReplicaSet  web-backend-5b96f69d45      (hash = hash of the Pod template)
     │  owns
     ▼
Pods        web-backend-5b96f69d45-r9stw
            web-backend-5b96f69d45-sdf7q
            web-backend-5b96f69d45-x4b4r
```

Deleting a Pod makes the **ReplicaSet** recreate it — not the Deployment. The Deployment
never touches Pods directly.

## Scaling

Both support scaling, and the mechanism is identical because the Deployment just passes the
number down:

```bash
kubectl scale deployment web-backend --replicas=5 -n session11
kubectl scale replicaset web-backend-5b96f69d45 --replicas=5 -n session11
```

The difference is **persistence**. Scaling the ReplicaSet directly is undone the moment the
Deployment controller reconciles, because the Deployment's own `spec.replicas` is still the
source of truth. Always scale the Deployment.

## Rolling updates

This is the decisive difference.

| | Deployment | ReplicaSet |
|---|---|---|
| Change the image | Creates a new ReplicaSet and shifts replicas gradually | **Does nothing to existing Pods** |
| Rollback | `kubectl rollout undo` | Not supported |
| Revision history | Yes (`kubectl rollout history`) | No |
| Strategies | RollingUpdate, Recreate | None |

If you edit a ReplicaSet's Pod template, the running Pods are **not** replaced. The new
template only applies to Pods created afterwards, so the change appears to do nothing until
a Pod happens to die. A Deployment solves exactly this.

## Relationship between Deployment and ReplicaSet

A Deployment **owns one ReplicaSet per revision**. During an update both exist, and the
controller scales one up while scaling the other down:

```
Deployment: web-backend
├── ReplicaSet web-backend-5b96f69d45   (revision 2, desired 3)  <- current
└── ReplicaSet web-backend-7d4c8f9a21   (revision 1, desired 0)  <- kept for rollback
```

Old ReplicaSets are kept at 0 replicas rather than deleted — that is what makes
`kubectl rollout undo` instant: it scales the old ReplicaSet back up instead of recreating
anything. `revisionHistoryLimit` (default 10) controls how many are retained.

**In practice you create Deployments, never ReplicaSets.** A bare ReplicaSet is only
reasonable when you explicitly want no update orchestration at all.

---

# 2. Deployment vs DaemonSet vs StatefulSet

All three are controllers that manage Pods. They differ in **how many Pods, where, with
what identity, and with what storage**.

## Use cases

| | Deployment | DaemonSet | StatefulSet |
|---|---|---|---|
| **Use case** | Stateless apps | One agent per node | Stateful, ordered apps |
| **Examples** | Web servers, REST APIs, workers | Log collectors, CNI plugins, node monitoring | Databases, message queues, consensus systems |
| **Real examples** | nginx, a Spring Boot API | Fluentd, Prometheus node-exporter, `kube-proxy`, `kindnet` | MySQL, PostgreSQL, MongoDB, Kafka, etcd, Zookeeper |

Live DaemonSets in this cluster:

```bash
kubectl get daemonsets -n kube-system
```

```
NAME         DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR            AGE
kindnet      1         1         1       1            1           <none>                   5d23h
kube-proxy   1         1         1       1            1           kubernetes.io/os=linux   5d23h
```

`DESIRED` is 1 because this cluster has one node. On a 50-node cluster it would be 50 —
you never set that number, the DaemonSet controller derives it from the node count.

## Pod creation

| | Deployment | DaemonSet | StatefulSet |
|---|---|---|---|
| **How many Pods** | `spec.replicas` | One per matching node (automatic) | `spec.replicas` |
| **Pod names** | Random suffix: `web-backend-5b96f69d45-r9stw` | Node-based: `kube-proxy-xn8vt` | **Ordinal and stable**: `mysql-0`, `mysql-1`, `mysql-2` |
| **Creation order** | All at once, parallel | As nodes join | **Sequential**: `mysql-0` must be Ready before `mysql-1` starts |
| **Deletion order** | Arbitrary | As nodes leave | **Reverse order**: `mysql-2` first |
| **Identity after restart** | New random name | Tied to node | **Same name**, same storage, same DNS |

Stable identity is the whole point of a StatefulSet. If `mysql-1` crashes, its replacement
is also called `mysql-1`, reattaches the same volume and keeps the same DNS name — so a
replica that was a follower stays a follower.

## Scaling

| | Deployment | DaemonSet | StatefulSet |
|---|---|---|---|
| **Scale command** | `kubectl scale --replicas=N` | **Not scalable** — add/remove nodes | `kubectl scale --replicas=N` |
| **Order** | Parallel | n/a | One at a time, in order |
| **Scale to zero** | Yes | No | Yes |

A DaemonSet has no `replicas` field at all; `nodeSelector`, affinity and tolerations are
what control which nodes get a Pod.

## Networking

| | Deployment | DaemonSet | StatefulSet |
|---|---|---|---|
| **Typical Service** | ClusterIP (load balanced) | Often none; sometimes `hostNetwork` or `hostPort` | **Headless** (`clusterIP: None`) |
| **Pod DNS** | None individually | None individually | **Per-Pod DNS name** |
| **Addressing** | Any Pod will do | The Pod on *this* node | A *specific* Pod |

A StatefulSet gives each Pod its own DNS record through the headless Service:

```
mysql-0.mysql-headless.default.svc.cluster.local
mysql-1.mysql-headless.default.svc.cluster.local
mysql-2.mysql-headless.default.svc.cluster.local
```

That is why Session 11's headless Service matters — it is the piece that makes per-replica
addressing possible. A Deployment behind a ClusterIP has no equivalent; you cannot target
one specific Pod by name.

## Storage

| | Deployment | DaemonSet | StatefulSet |
|---|---|---|---|
| **Volume style** | Shared PVC or ephemeral `emptyDir` | Usually `hostPath` (node's own files) | **`volumeClaimTemplates`** |
| **Per-Pod volume** | No — all replicas share one PVC | Per node | **Yes — one PVC per Pod, created automatically** |
| **Survives rescheduling** | Depends | Node-local | **Yes — the same PVC is reattached** |

`volumeClaimTemplates` is unique to StatefulSets: a 3-replica StatefulSet automatically
creates `data-mysql-0`, `data-mysql-1`, `data-mysql-2`. Deleting the StatefulSet does
**not** delete those PVCs, which is deliberate — it protects the data.

## Summary

| Question | Answer |
|---|---|
| Stateless app, any replica interchangeable? | **Deployment** |
| Must run on every node? | **DaemonSet** |
| Needs stable name, stable storage, ordered startup? | **StatefulSet** |

---

# 3. ReplicaSet vs Service

These are not alternatives — they solve orthogonal problems and almost always appear
together.

## ReplicaSet responsibility

**Lifecycle.** A ReplicaSet makes sure N Pods exist:

- creates Pods from a template
- watches them and recreates any that die (self-healing)
- deletes surplus Pods when scaled down
- does **not** care about IP addresses, networking or how anyone reaches the Pods

## Service responsibility

**Connectivity.** A Service gives a changing set of Pods a stable address:

- allocates a stable virtual IP and DNS name that never change
- continuously tracks which Pods match its selector and are Ready
- load balances across them
- does **not** create, delete, restart or heal Pods

## Why a Service is required

Pods are ephemeral and get a **new IP every time they are recreated**. In this session the
backend Pods had IPs `10.244.0.92`, `.93`, `.94` — but after any restart, rescheduling,
scale-up or rolling update those IPs change. A client cannot hardcode them.

Three concrete problems a Service solves:

1. **IP churn** — the ClusterIP `10.103.253.228` stayed fixed while Pod IPs come and go.
2. **Discovery** — clients use the name `clusterip-svc`, not an IP list.
3. **Load balancing** — one request hit `x4b4r`, the next `r9stw`, with no client logic.

Without a Service, a client would have to watch the Kubernetes API itself, maintain its own
Pod list and implement its own load balancing — in every application.

## How traffic reaches Pods

```
  Client Pod
      │  1. resolve "clusterip-svc" via CoreDNS (10.96.0.10)
      ▼
  10.103.253.228:80            <- stable ClusterIP, a virtual IP
      │  2. kube-proxy iptables/IPVS rule DNATs to a random endpoint
      ▼
  10.244.0.92:80  /  10.244.0.93:80  /  10.244.0.94:80
      │  3. CNI (kindnet) delivers the packet to the Pod
      ▼
  nginx container
```

Step by step:

1. **DNS** — the client resolves the Service name to the ClusterIP (see
   [`../fqdn/README.md`](../fqdn/README.md)).
2. **EndpointSlice** — the endpoints controller watches Pods matching
   `app: web-backend` that are **Ready**, and writes their IPs into an EndpointSlice:

   ```bash
   kubectl get endpoints clusterip-svc -n session11
   ```
   ```
   NAME            ENDPOINTS                                      AGE
   clusterip-svc   10.244.0.92:80,10.244.0.93:80,10.244.0.94:80   26s
   ```

3. **kube-proxy** watches EndpointSlices and programs iptables rules on every node that
   DNAT traffic destined for `10.103.253.228:80` to one of those Pod IPs at random.
4. **CNI** routes the packet to the Pod.

The ClusterIP is **never assigned to any network interface** — it exists purely as an
iptables rule. That is why `curl http://10.103.253.228` from the Windows host timed out
with exit code 28: there is no host, only a rule that exists on cluster nodes.

## How they work together

```
ReplicaSet ──creates//heals──> Pods <──selects by label── Service
   "there are always 3"                      "reach them at one stable address"
```

Both use the **same labels**, which is the only coupling between them:

```yaml
# ReplicaSet / Deployment - stamps the label onto Pods it creates
template:
  metadata:
    labels:
      app: web-backend

# Service - selects Pods carrying that label
spec:
  selector:
    app: web-backend
```

Neither object references the other by name. Add a Pod with the right label by hand and the
Service will route to it; remove the label from a running Pod and the Service drops it from
its endpoints while the ReplicaSet immediately creates a replacement — a trick sometimes
used to pull a misbehaving Pod out of service for debugging without killing it.

| | ReplicaSet | Service |
|---|---|---|
| Concern | Lifecycle — *do the Pods exist?* | Connectivity — *how do I reach them?* |
| Watches | Pods | Pods (Ready ones) |
| Creates Pods | Yes | No |
| Has an IP | No | Yes (except headless/ExternalName) |
| Survives Pod restarts | Recreates them | Address stays the same |
