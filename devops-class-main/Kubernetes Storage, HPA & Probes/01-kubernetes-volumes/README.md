# Task 1 — Kubernetes Volumes

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

Session 13 — Kubernetes Storage, HPA & Probes

---

## Why volumes exist

A container's filesystem is **ephemeral**. When a container restarts, everything written
inside it is gone — and a Pod with multiple containers has no way to share files at all.
Volumes solve both problems.

The key distinction to keep in mind throughout:

| Lifetime tied to | Volume types |
|---|---|
| **The container** | (no volume — the container's own writable layer) |
| **The Pod** | `emptyDir` |
| **The node** | `hostPath` |
| **Independent of both** | `PersistentVolume` + `PersistentVolumeClaim` |

---

## 1. emptyDir

An empty directory created when the Pod is assigned to a node, and **deleted permanently
when the Pod is removed**. All containers in the Pod can mount it, which makes it the
standard way for a sidecar to share files with the main container.

### Manifest — `01-emptydir.yaml`

```yaml
spec:
  containers:
    - name: writer
      image: busybox:1.36
      command: ["/bin/sh", "-c"]
      args:
        - while true; do echo "$(date) written by writer" >> /shared/data.log; sleep 5; done
      volumeMounts:
        - name: shared-data
          mountPath: /shared

    - name: reader
      image: busybox:1.36
      command: ["/bin/sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: shared-data
          mountPath: /shared
          readOnly: true

  volumes:
    - name: shared-data
      emptyDir: {}
```

### Practical demonstration

```bash
kubectl apply -f 01-kubernetes-volumes/01-emptydir.yaml
kubectl get pod emptydir-demo -n session13
```

```
NAME            READY   STATUS    RESTARTS   AGE
emptydir-demo   2/2     Running   0          30s
```

`2/2` — both containers are up. The `reader` container reads what `writer` produced:

```bash
kubectl exec emptydir-demo -n session13 -c reader -- cat /shared/data.log
```

```
Tue Oct  6 17:44:21 UTC 2026 written by writer
Tue Oct  6 17:44:26 UTC 2026 written by writer
Tue Oct  6 17:44:31 UTC 2026 written by writer
Tue Oct  6 17:44:36 UTC 2026 written by writer
```

Two separate containers, one shared directory.

### Properties

| | |
|---|---|
| **Lifetime** | The Pod. Deleted with it — **data is lost** |
| **Survives container restart** | Yes |
| **Survives Pod deletion** | **No** |
| **Shared between containers** | Yes |
| **Backing store** | The node's disk, or RAM with `emptyDir: {medium: Memory}` |

### Use cases

- Scratch space for temporary files or sorting
- A sidecar shipping logs written by the main container
- A cache that can safely be rebuilt
- Checkpointing during a long computation

---

## 2. hostPath

Mounts a file or directory **from the node's own filesystem** into the Pod. Data outlives
the Pod, but is tied to that specific node.

### Manifest — `02-hostpath.yaml`

```yaml
spec:
  containers:
    - name: app
      image: busybox:1.36
      volumeMounts:
        - name: node-storage
          mountPath: /node-data
  volumes:
    - name: node-storage
      hostPath:
        path: /tmp/k8s-hostpath-demo
        type: DirectoryOrCreate
```

### Practical demonstration

Write from inside the Pod:

```bash
kubectl exec hostpath-demo -n session13 -- sh -c "echo 'written from pod' > /node-data/test.txt"
kubectl exec hostpath-demo -n session13 -- cat /node-data/test.txt
```

```
written from pod
```

Now read the **same file directly on the node**, outside Kubernetes entirely:

```bash
minikube ssh "cat /tmp/k8s-hostpath-demo/test.txt"
```

```
written from pod
```

The Pod wrote to the node's real filesystem.

### `type` values

| Value | Behaviour |
|---|---|
| `DirectoryOrCreate` | Create the directory if missing |
| `Directory` | Must already exist, else the Pod fails |
| `FileOrCreate` | Create an empty file if missing |
| `File` | Must already exist |
| `Socket` | Must be a UNIX socket |

### Properties and warnings

| | |
|---|---|
| **Lifetime** | The node |
| **Survives Pod deletion** | Yes |
| **Portable across nodes** | **No** — a Pod rescheduled elsewhere sees different data |
| **Security** | **Dangerous.** Mounting `/` or `/var/run/docker.sock` can give full node control |

hostPath is a **security risk** in multi-tenant clusters and most production setups block
it with Pod Security Standards. It is acceptable for:

- Node-level agents that must read node files (log collectors reading `/var/log`)
- Monitoring agents reading `/proc` or `/sys`
- Single-node development clusters like Minikube

For ordinary application data, use a PersistentVolumeClaim instead.

---

## 3. PersistentVolume (PV)

A **PersistentVolume** is a piece of storage in the cluster, provisioned by an
administrator or created dynamically by a StorageClass. It is a **cluster-scoped** resource
— it does not belong to a namespace — and its lifecycle is independent of any Pod.

### Manifest — `03-pv.yaml`

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: manual-pv
spec:
  capacity:
    storage: 1Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  hostPath:
    path: /tmp/k8s-manual-pv
```

### Access modes

| Mode | Short | Meaning |
|---|---|---|
| `ReadWriteOnce` | RWO | Read-write by a **single node** |
| `ReadOnlyMany` | ROX | Read-only by many nodes |
| `ReadWriteMany` | RWX | Read-write by many nodes (needs NFS, CephFS, EFS…) |
| `ReadWriteOncePod` | RWOP | Read-write by exactly **one Pod** (Kubernetes 1.22+) |

Most block storage (AWS EBS, GCP PD) is **RWO only** — a common surprise when trying to
scale a Deployment that mounts one.

### Reclaim policies

| Policy | What happens when the PVC is deleted |
|---|---|
| `Retain` | PV is kept, data preserved, must be cleaned up manually |
| `Delete` | PV **and the underlying storage** are deleted |
| `Recycle` | Deprecated — was a basic `rm -rf` |

### PV phases

| Phase | Meaning |
|---|---|
| `Available` | Free, not yet bound to a claim |
| `Bound` | Bound to a PVC |
| `Released` | The PVC was deleted, but the PV has not been reclaimed |
| `Failed` | Automatic reclamation failed |

---

## 4. PersistentVolumeClaim (PVC)

A **PersistentVolumeClaim** is a *request* for storage made by a user. It is
**namespace-scoped**. Kubernetes matches it to a suitable PV and binds the two together.

This separation is the whole point: **developers ask for storage without knowing what
provides it.**

```
     Developer                          Administrator / StorageClass
         │                                          │
         │ creates                                  │ creates (or provisions)
         ▼                                          ▼
   PersistentVolumeClaim  <──── bound to ────>  PersistentVolume
   "I need 500Mi, RWO"                          "1Gi, RWO, hostPath"
         │
         │ referenced by
         ▼
       Pod
```

### Manifest — `04-pvc.yaml`

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: manual-pvc
  namespace: session13
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: manual
  resources:
    requests:
      storage: 500Mi
```

### Binding

```bash
kubectl apply -f 01-kubernetes-volumes/03-pv.yaml
kubectl apply -f 01-kubernetes-volumes/04-pvc.yaml
kubectl get pv
kubectl get pvc -n session13
```

```
NAME        CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                  STORAGECLASS   AGE
manual-pv   1Gi        RWO            Retain           Bound    session13/manual-pvc   manual         31s

NAME         STATUS   VOLUME      CAPACITY   ACCESS MODES   STORAGECLASS   AGE
manual-pvc   Bound    manual-pv   1Gi        manual         RWO            31s
```

The PVC asked for **500Mi** and bound to a **1Gi** PV. Binding requires the PV to be *at
least* as large — the claim then reports the PV's full capacity, so the extra 500Mi is
simply unused. Kubernetes never splits a PV between claims.

### Using a PVC in a Pod — `05-pvc-pod.yaml`

```yaml
  volumes:
    - name: persistent-storage
      persistentVolumeClaim:
        claimName: manual-pvc
```

The Pod references the **claim**, never the PV. That indirection is what makes the manifest
portable between clusters with completely different storage backends.

### Practical demonstration — data survives Pod deletion

This is the property that separates a PVC from `emptyDir`:

```bash
# 1. Write data
kubectl exec pvc-demo -n session13 -- sh -c 'echo "important data - run 2" > /data/important.txt'
kubectl exec pvc-demo -n session13 -- cat /data/important.txt
```
```
important data - run 2
```

```bash
# 2. Destroy the Pod entirely
kubectl delete pod pvc-demo -n session13 --force --grace-period=0
```
```
pod "pvc-demo" force deleted from session13 namespace
```

```bash
# 3. Recreate it from the same manifest and read the file back
kubectl apply -f 01-kubernetes-volumes/05-pvc-pod.yaml
kubectl get pod pvc-demo -n session13
kubectl exec pvc-demo -n session13 -- cat /data/important.txt
```
```
NAME       READY   STATUS    RESTARTS   AGE
pvc-demo   1/1     Running   0          20s

important data - run 2
```

**The data survived.** With `emptyDir` it would have been lost. The file is really on the
node, under the PV's path:

```bash
minikube ssh "ls -l /tmp/k8s-manual-pv/"
```
```
total 4
-rw-r--r-- 1 root root 23 Oct  6 17:45 important.txt
```

```bash
kubectl describe pvc manual-pvc -n session13
```

```
Name:          manual-pvc
Namespace:     session13
StorageClass:  manual
Status:        Bound
Volume:        manual-pv
Finalizers:    [kubernetes.io/pvc-protection]
Capacity:      1Gi
Access Modes:  RWO
VolumeMode:    Filesystem
Used By:       pvc-demo
```

Note `Finalizers: [kubernetes.io/pvc-protection]` — Kubernetes refuses to delete a PVC
while a Pod is still using it. Deleting it just marks it `Terminating` until the Pod goes.

---

## 5. StorageClass

A **StorageClass** describes a *class* of storage the cluster can provision on demand. It
names a **provisioner** (the driver that creates volumes), plus parameters and a reclaim
policy.

```bash
kubectl get storageclass
```

```
NAME                 PROVISIONER                RECLAIMPOLICY   VOLUMEBINDINGMODE   ALLOWVOLUMEEXPANSION   AGE
standard (default)   k8s.io/minikube-hostpath   Delete          Immediate           false                  6d
```

### Fields

| Field | Meaning |
|---|---|
| `provisioner` | Which driver creates the volume (`kubernetes.io/aws-ebs`, `ebs.csi.aws.com`, `k8s.io/minikube-hostpath`, …) |
| `reclaimPolicy` | `Delete` (default) or `Retain`, applied to PVs it creates |
| `volumeBindingMode` | `Immediate`, or `WaitForFirstConsumer` to delay binding until a Pod is scheduled |
| `allowVolumeExpansion` | Whether a PVC can be grown later |
| `parameters` | Driver-specific — disk type, IOPS, encryption, filesystem |

`(default)` means a PVC that omits `storageClassName` uses this class automatically.

### `volumeBindingMode` matters in multi-zone clusters

`Immediate` binds as soon as the PVC is created — which can place the volume in a zone
where the Pod cannot be scheduled. `WaitForFirstConsumer` waits until a Pod is scheduled,
then provisions in the right zone. On cloud providers this is almost always what you want.

### Example — AWS EBS

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  encrypted: "true"
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

---

## 6. Dynamic provisioning

With **static** provisioning an administrator must create a PV ahead of every claim. With
**dynamic** provisioning the StorageClass creates the PV automatically when a PVC appears.

```
  STATIC                                  DYNAMIC
  ------                                  -------
  Admin creates PV by hand                PVC created
       │                                       │
  PVC created                            StorageClass provisioner runs
       │                                       │
  Controller matches them                PV created automatically
       │                                       │
     Bound                                   Bound
```

### Manifest — `06-dynamic-pvc.yaml`

No PV is defined anywhere:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: dynamic-pvc
  namespace: session13
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: standard
  resources:
    requests:
      storage: 200Mi
```

### Practical demonstration

```bash
kubectl apply -f 01-kubernetes-volumes/06-dynamic-pvc.yaml
kubectl get pvc -n session13
kubectl get pv
```

```
NAME          STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
dynamic-pvc   Bound    pvc-d2c42ea3-bfa4-46cd-8ac9-3ce53c2c54d8   200Mi      RWO            standard       31s
manual-pvc    Bound    manual-pv                                  1Gi        RWO            manual         31s

NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                   STORAGECLASS   AGE
manual-pv                                  1Gi        RWO            Retain           Bound    session13/manual-pvc    manual         31s
pvc-d2c42ea3-bfa4-46cd-8ac9-3ce53c2c54d8   200Mi      RWO            Delete           Bound    session13/dynamic-pvc   standard       31s
```

Compare the two rows:

| | `manual-pv` | `pvc-d2c42ea3-...` |
|---|---|---|
| Created by | Me, from `03-pv.yaml` | **The provisioner, automatically** |
| Name | Chosen by me | Generated, `pvc-<uid>` |
| Capacity | 1Gi (fixed in advance) | **200Mi — exactly what was requested** |
| Reclaim policy | `Retain` (from the PV) | `Delete` (from the StorageClass) |

The dynamic PV matches the request exactly — no wasted 500Mi as in the static case — and
nobody had to create it.

---

## Summary

| Volume type | Scope | Survives Pod delete | Survives node change | Typical use |
|---|---|---|---|---|
| **emptyDir** | Pod | **No** | No | Scratch space, sidecar sharing |
| **hostPath** | Node | Yes | **No** | Node agents, monitoring |
| **PV + PVC (static)** | Cluster | **Yes** | Depends on backend | Admin-managed storage |
| **PV + PVC (dynamic)** | Cluster | **Yes** | Depends on backend | **Standard production choice** |

### Decision guide

1. **Temporary data that can be lost?** → `emptyDir`
2. **Must read the node's own files?** → `hostPath` (and accept the security trade-off)
3. **Application data that must persist?** → **PVC with a StorageClass** (dynamic)
4. **One volume per replica, e.g. a database?** → StatefulSet with `volumeClaimTemplates`

### Commands

```bash
kubectl get pv                                    # cluster-scoped, no -n
kubectl get pvc -n <namespace>                    # namespace-scoped
kubectl get storageclass
kubectl describe pvc <name> -n <namespace>        # Status, Volume, Used By
kubectl describe pv <name>                        # Claim, Reclaim Policy, Source
```

**Troubleshooting tip:** a PVC stuck in `Pending` almost always means no PV satisfies it.
Check `kubectl describe pvc` — the Events will say whether the size is too large, the access
mode is unavailable, or the `storageClassName` does not exist.
