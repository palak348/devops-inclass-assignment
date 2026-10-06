# Session 9 — Kubernetes Fundamentals

## Student Information

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

---

## Objective

The objective of this practical was to install and configure **Minikube** on a local
machine, verify that the Kubernetes cluster is healthy, explore the Kubernetes
architecture (control plane + node components), learn the basic Kubernetes objects
and `kubectl` commands, and complete the official **Kubernetes Basics** tutorial
hands-on — deploy an app, explore it, expose it, scale it, and update it.

---

## Environment

| Tool | Version |
|---|---|
| Minikube | v1.39.0 |
| kubectl (client) | v1.36.1 |
| Kubernetes (server) | v1.37.0 |
| Docker | 29.7.2 |
| Driver | docker |
| Container runtime | containerd 2.3.4 |
| Node OS | Debian GNU/Linux 12 (bookworm) |

---

## Task 1 — Install and Configure Minikube

Minikube runs a single-node Kubernetes cluster inside a Docker container on the local
machine. Docker Desktop must be running first, because Docker is the driver.

```bash
# Verify the tooling is installed
minikube version
kubectl version --client
docker --version

# Start the cluster using the docker driver
minikube start --driver=docker
```

**Output:**

```
minikube version: v1.39.0
commit: 7a9f6a841470a207de8cf4bafcccee0969d8ba10

Client Version: v1.36.1
Kustomize Version: v5.8.1

Docker version 29.7.2, build a7dcaa6
```

### Profile created by Minikube

```bash
minikube profile list
```

```
PROFILE  | DRIVER | RUNTIME    | IP           | VERSION | STATUS | NODES | ACTIVE PROFILE | ACTIVE KUBECONTEXT
---------|--------|------------|--------------|---------|--------|-------|----------------|-------------------
minikube | docker | containerd | 192.168.49.2 | v1.37.0 | OK     | 1     | *              | *
```

`minikube start` also writes a kubecontext named `minikube` into `~/.kube/config` and
makes it the active context, so `kubectl` talks to this cluster automatically.

```bash
kubectl config current-context
kubectl config get-contexts
```

```
minikube

CURRENT   NAME       CLUSTER    AUTHINFO   NAMESPACE
*         minikube   minikube   minikube   default
```

### Screenshot

![minikube start](images/01-minikube-start.png)

---

## Task 2 — Verify Kubernetes Cluster Status

```bash
minikube status
```

```
minikube
type: Control Plane
host: Running
kubelet: Running
apiserver: Running
kubeconfig: Configured
```

```bash
kubectl cluster-info
```

```
Kubernetes control plane is running at https://127.0.0.1:53933
CoreDNS is running at https://127.0.0.1:53933/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
```

```bash
kubectl get nodes -o wide
```

```
NAME       STATUS   ROLES           AGE     VERSION   INTERNAL-IP    EXTERNAL-IP   OS-IMAGE                         CONTAINER-RUNTIME
minikube   Ready    control-plane   5d20h   v1.37.0   192.168.49.2   <none>        Debian GNU/Linux 12 (bookworm)   containerd://2.3.4
```

```bash
kubectl get componentstatuses
```

```
Warning: v1 ComponentStatus is deprecated in v1.19+
NAME                 STATUS    MESSAGE   ERROR
controller-manager   Healthy   ok
scheduler            Healthy   ok
etcd-0               Healthy   ok
```

The node is `Ready` and all three control-plane components report `Healthy`, so the
cluster is working.

### Screenshot

![cluster status](images/02-cluster-status.png)

---

## Task 3 — Explore Kubernetes Architecture

### 3.1 Default namespaces

```bash
kubectl get namespaces
```

```
NAME              STATUS   AGE
default           Active   5d20h
kube-node-lease   Active   5d20h
kube-public       Active   5d20h
kube-system       Active   5d20h
```

| Namespace | Purpose |
|---|---|
| `default` | Where objects go when no namespace is specified |
| `kube-system` | Kubernetes' own system components (control plane, DNS, proxy) |
| `kube-public` | Readable by everyone, including unauthenticated users — holds cluster info |
| `kube-node-lease` | Holds Lease objects used for node heartbeats |

### 3.2 Control plane components actually running

```bash
kubectl get pods -n kube-system
```

```
NAME                               READY   STATUS    RESTARTS   AGE
coredns-559f6c778d-nkrkr           1/1     Running   0          5d20h
etcd-minikube                      1/1     Running   0          5d20h
kindnet-n6gfz                      1/1     Running   0          5d20h
kube-apiserver-minikube            1/1     Running   0          5d20h
kube-controller-manager-minikube   1/1     Running   0          5d20h
kube-proxy-xn8vt                   1/1     Running   0          5d20h
kube-scheduler-minikube            1/1     Running   0          5d20h
storage-provisioner                1/1     Running   0          5d20h
```

```bash
kubectl get all -n kube-system
```

```
NAME               TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)                  AGE
service/kube-dns   ClusterIP   10.96.0.10   <none>        53/UDP,53/TCP,9153/TCP   5d20h

NAME                        DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR            AGE
daemonset.apps/kindnet      1         1         1       1            1           <none>                   5d20h
daemonset.apps/kube-proxy   1         1         1       1            1           kubernetes.io/os=linux   5d20h

NAME                      READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/coredns   1/1     1            1           5d20h
```

### 3.3 Notes on Kubernetes architecture

A Kubernetes cluster is split into a **control plane** (the brain, which decides what
should run) and **worker nodes** (the muscle, which actually run the containers). In
Minikube both roles live on the single `minikube` node, which is why it shows the
`control-plane` role but still schedules normal workloads.

```
                   +---------------------- CONTROL PLANE ----------------------+
                   |                                                           |
   kubectl ------> |   kube-apiserver  <-------->  etcd                         |
                   |         ^                                                 |
                   |         |                                                 |
                   |   kube-scheduler        kube-controller-manager           |
                   |                                                           |
                   +--------------------------+--------------------------------+
                                              |
                   +--------------------------v------- WORKER NODE ------------+
                   |                                                           |
                   |   kubelet ----> container runtime (containerd) ----> Pods |
                   |   kube-proxy ----> iptables rules for Service traffic     |
                   |   CNI plugin (kindnet) ----> Pod networking               |
                   |                                                           |
                   +-----------------------------------------------------------+
```

**Control plane components**

| Component | What it does |
|---|---|
| **kube-apiserver** | The front door of the cluster. Every command, controller and kubelet talks to it over REST. It validates requests and is the *only* component that reads/writes etcd. |
| **etcd** | Distributed key-value store holding the entire cluster state — the single source of truth. If etcd is lost, the cluster's desired state is lost. |
| **kube-scheduler** | Watches for Pods with no node assigned and picks a node for them based on resource requests, taints/tolerations and affinity. It only *decides*; it does not start the container. |
| **kube-controller-manager** | Runs the control loops (Node, ReplicaSet, Deployment, Endpoint, Job controllers). Each loop continuously compares **desired state** with **actual state** and acts to close the gap. This reconciliation loop is the core idea of Kubernetes. |
| **cloud-controller-manager** | Talks to the cloud provider for LoadBalancers, routes and node lifecycle. Not present in Minikube since there is no cloud. |

**Node components**

| Component | What it does |
|---|---|
| **kubelet** | The agent on every node. It receives PodSpecs from the API server and makes sure those containers are running and healthy, reporting status back. |
| **Container runtime** | Pulls images and runs containers. Here it is **containerd 2.3.4** — Minikube no longer uses Docker as the in-cluster runtime by default. |
| **kube-proxy** | Programs iptables/IPVS rules so traffic sent to a Service's ClusterIP is load-balanced to the backing Pod IPs. |
| **CNI plugin (kindnet)** | Gives every Pod its own routable IP and makes Pod-to-Pod traffic work across the cluster. |
| **CoreDNS** | Cluster DNS. Resolves Service names such as `nginx-demo-svc.k8s-fundamentals.svc.cluster.local` to ClusterIPs. |

**What happens when you run `kubectl create deployment`:**

1. `kubectl` sends the Deployment object to **kube-apiserver**.
2. apiserver validates it and writes it into **etcd**.
3. The **Deployment controller** sees a new Deployment and creates a **ReplicaSet**.
4. The **ReplicaSet controller** sees it needs N Pods and creates N Pod objects (unscheduled).
5. The **scheduler** sees Pods with an empty `nodeName` and binds each to a node.
6. The **kubelet** on that node sees Pods assigned to it and tells **containerd** to pull the image and start the container.
7. kubelet reports status back to the apiserver, and `kubectl get pods` shows `Running`.

### Screenshot

![architecture / kube-system](images/03-architecture.png)

---

## Task 4 — Basic Kubernetes Objects and Commands

### 4.1 Discovering objects

```bash
kubectl api-resources
```

```
NAME                       SHORTNAMES   APIVERSION   NAMESPACED   KIND
configmaps                 cm           v1           true         ConfigMap
endpoints                  ep           v1           true         Endpoints
namespaces                 ns           v1           false        Namespace
nodes                      no           v1           false        Node
persistentvolumeclaims     pvc          v1           true         PersistentVolumeClaim
persistentvolumes          pv           v1           false        PersistentVolume
pods                       po           v1           true         Pod
secrets                                 v1           true         Secret
serviceaccounts            sa           v1           true         ServiceAccount
services                   svc          v1           true         Service
daemonsets                 ds           apps/v1      true         DaemonSet
deployments                deploy       apps/v1      true         Deployment
replicasets                rs           apps/v1      true         ReplicaSet
```

```bash
kubectl explain pod
```

```
KIND:       Pod
VERSION:    v1

DESCRIPTION:
    Pod is a collection of containers that can run on a host. This resource is
    created by clients and scheduled onto hosts.

FIELDS:
  apiVersion    <string>
  kind          <string>
  metadata      <ObjectMeta>
  spec          <PodSpec>
  status        <PodStatus>
```

### 4.2 Core objects learned

| Object | Short | What it is |
|---|---|---|
| **Pod** | `po` | Smallest deployable unit. One or more containers sharing a network namespace and storage. Pods are mortal — never managed directly in production. |
| **ReplicaSet** | `rs` | Keeps a given number of identical Pod replicas running. Self-heals by recreating deleted or crashed Pods. |
| **Deployment** | `deploy` | Manages ReplicaSets and adds rolling updates and rollbacks. This is what you normally create. |
| **Service** | `svc` | Stable virtual IP and DNS name in front of a changing set of Pods, with built-in load balancing. |
| **Namespace** | `ns` | Virtual cluster inside the cluster, used to group and isolate resources. |
| **ConfigMap** | `cm` | Non-secret configuration injected into Pods as env vars or files. |
| **Secret** | — | Same idea as ConfigMap, for sensitive data (base64-encoded at rest). |
| **DaemonSet** | `ds` | Runs exactly one Pod on every node (log collectors, CNI, kube-proxy). |
| **Node** | `no` | A worker machine in the cluster. |

### 4.3 Essential kubectl commands

| Command | Purpose |
|---|---|
| `kubectl get <resource>` | List objects |
| `kubectl get <resource> -o wide` | List with extra columns (IP, node) |
| `kubectl describe <resource> <name>` | Full details plus **Events** — first stop for debugging |
| `kubectl logs <pod>` | Container stdout/stderr |
| `kubectl exec -it <pod> -- sh` | Shell inside a container |
| `kubectl apply -f <file/dir>` | Declarative create/update |
| `kubectl delete -f <file>` | Delete what the manifest defines |
| `kubectl scale deploy/<name> --replicas=N` | Change replica count |
| `kubectl set image deploy/<name> <c>=<img>` | Trigger a rolling update |
| `kubectl rollout status / history / undo` | Watch, inspect or revert a rollout |
| `kubectl api-resources` | Every object kind the cluster knows |
| `kubectl explain <kind>.<field>` | Built-in schema documentation |

---

## Task 5 — Kubernetes Basics Tutorial (Hands-On)

### Module 1 & 2 — Deploy an app

```bash
kubectl create deployment kubernetes-bootcamp --image=gcr.io/google-samples/kubernetes-bootcamp:v1
kubectl get deployments
kubectl get pods -o wide
```

```
deployment.apps/kubernetes-bootcamp created

NAME                  READY   UP-TO-DATE   AVAILABLE   AGE
kubernetes-bootcamp   1/1     1            1           30s

NAME                                   READY   STATUS    RESTARTS   AGE   IP            NODE
kubernetes-bootcamp-5cc66bcc9b-52rqr   1/1     Running   0          30s   10.244.0.33   minikube
```

Note the object chain Kubernetes created automatically — Deployment to ReplicaSet to Pod:

```bash
kubectl get rs -l app=kubernetes-bootcamp
```

```
NAME                             DESIRED   CURRENT   READY   AGE
kubernetes-bootcamp-5cc66bcc9b   1         1         1       30s
```

### Module 3 — Explore the app

```bash
kubectl describe pod kubernetes-bootcamp-5cc66bcc9b-52rqr
```

```
Name:             kubernetes-bootcamp-5cc66bcc9b-52rqr
Namespace:        default
Node:             minikube/192.168.49.2
Labels:           app=kubernetes-bootcamp
                  pod-template-hash=5cc66bcc9b
Status:           Running
IP:               10.244.0.33
Controlled By:    ReplicaSet/kubernetes-bootcamp-5cc66bcc9b
Containers:
  kubernetes-bootcamp:
    Image:          gcr.io/google-samples/kubernetes-bootcamp:v1
    State:          Running
    Ready:          True
    Restart Count:  0
Conditions:
  Initialized       True
  Ready             True
  ContainersReady   True
  PodScheduled      True
QoS Class:          BestEffort
Events:
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal  Scheduled  44s   default-scheduler  Successfully assigned default/kubernetes-bootcamp-5cc66bcc9b-52rqr to minikube
  Normal  Pulling    43s   kubelet            Pulling image "gcr.io/google-samples/kubernetes-bootcamp:v1"
  Normal  Pulled     15s   kubelet            Successfully pulled image in 28.147s. Image size: 83642968 bytes.
  Normal  Created    15s   kubelet            Container created
  Normal  Started    15s   kubelet            Container started
```

The **Events** section at the bottom is the most useful part of `describe` — it shows
the scheduler decision, image pull and container start in order.

```bash
kubectl logs kubernetes-bootcamp-5cc66bcc9b-52rqr
```

```
Kubernetes Bootcamp App Started At: 2026-10-06T14:29:50.053Z | Running On:  kubernetes-bootcamp-5cc66bcc9b-52rqr
```

```bash
kubectl exec kubernetes-bootcamp-5cc66bcc9b-52rqr -- env
```

```
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOSTNAME=kubernetes-bootcamp-5cc66bcc9b-52rqr
NODE_VERSION=6.3.1
KUBERNETES_SERVICE_HOST=10.96.0.1
KUBERNETES_SERVICE_PORT=443
KUBERNETES_PORT_443_TCP=tcp://10.96.0.1:443
HOME=/root
```

Kubernetes injects Service connection details as environment variables into every
container — that is how older apps can discover Services without using DNS.

### Module 4 — Expose the app publicly

```bash
kubectl expose deployment/kubernetes-bootcamp --type=NodePort --port=8080
kubectl get services kubernetes-bootcamp
kubectl describe services/kubernetes-bootcamp
```

```
service/kubernetes-bootcamp exposed

NAME                  TYPE       CLUSTER-IP     EXTERNAL-IP   PORT(S)          AGE
kubernetes-bootcamp   NodePort   10.102.32.15   <none>        8080:31655/TCP   0s

Name:                     kubernetes-bootcamp
Namespace:                default
Selector:                 app=kubernetes-bootcamp
Type:                     NodePort
IP:                       10.102.32.15
Port:                     <unset>  8080/TCP
TargetPort:               8080/TCP
NodePort:                 <unset>  31655/TCP
Endpoints:                10.244.0.33:8080
```

Access it through the node IP and the NodePort:

```bash
curl http://$(minikube ip):31655
```

```
Hello Kubernetes bootcamp! | Running on: kubernetes-bootcamp-5cc66bcc9b-52rqr | v=1
```

The `Endpoints` field is how the Service knows which Pods to send traffic to — it is
populated by matching the Service's `selector` against Pod labels.

### Screenshot

![app exposed](images/04-expose-service.png)

### Module 5 — Scale the app

```bash
kubectl scale deployments/kubernetes-bootcamp --replicas=4
kubectl get deployments kubernetes-bootcamp
kubectl get pods -o wide
```

```
deployment.apps/kubernetes-bootcamp scaled

NAME                  READY   UP-TO-DATE   AVAILABLE   AGE
kubernetes-bootcamp   4/4     4            4           79s

NAME                                   READY   STATUS    RESTARTS   AGE   IP            NODE
kubernetes-bootcamp-5cc66bcc9b-52rqr   1/1     Running   0          79s   10.244.0.33   minikube
kubernetes-bootcamp-5cc66bcc9b-9sprk   1/1     Running   0          15s   10.244.0.35   minikube
kubernetes-bootcamp-5cc66bcc9b-wnbnz   1/1     Running   0          15s   10.244.0.34   minikube
kubernetes-bootcamp-5cc66bcc9b-xpqh9   1/1     Running   0          15s   10.244.0.36   minikube
```

Hitting the Service repeatedly shows the load balancing across replicas:

```bash
for i in 1 2 3 4; do curl http://$(minikube ip):31655; done
```

```
Hello Kubernetes bootcamp! | Running on: kubernetes-bootcamp-5cc66bcc9b-xpqh9 | v=1
Hello Kubernetes bootcamp! | Running on: kubernetes-bootcamp-5cc66bcc9b-xpqh9 | v=1
Hello Kubernetes bootcamp! | Running on: kubernetes-bootcamp-5cc66bcc9b-9sprk | v=1
Hello Kubernetes bootcamp! | Running on: kubernetes-bootcamp-5cc66bcc9b-xpqh9 | v=1
```

Different Pod names in the responses confirm kube-proxy is distributing requests.
Scaling back down:

```bash
kubectl scale deployments/kubernetes-bootcamp --replicas=2
kubectl get pods
```

```
NAME                                   READY   STATUS        RESTARTS   AGE
kubernetes-bootcamp-5cc66bcc9b-52rqr   1/1     Running       0          90s
kubernetes-bootcamp-5cc66bcc9b-9sprk   1/1     Running       0          26s
kubernetes-bootcamp-5cc66bcc9b-wnbnz   1/1     Terminating   0          26s
kubernetes-bootcamp-5cc66bcc9b-xpqh9   1/1     Terminating   0          26s
```

### Screenshot

![scaling](images/05-scaling.png)

### Module 6 — Update the app (rolling update)

```bash
kubectl set image deployments/kubernetes-bootcamp kubernetes-bootcamp=jocatalin/kubernetes-bootcamp:v2
kubectl rollout status deployments/kubernetes-bootcamp
```

```
deployment.apps/kubernetes-bootcamp image updated

Waiting for deployment "kubernetes-bootcamp" rollout to finish: 2 out of 4 new replicas have been updated...
Waiting for deployment "kubernetes-bootcamp" rollout to finish: 3 out of 4 new replicas have been updated...
Waiting for deployment "kubernetes-bootcamp" rollout to finish: 1 old replicas are pending termination...
Waiting for deployment "kubernetes-bootcamp" rollout to finish: 3 of 4 updated replicas are available...
deployment "kubernetes-bootcamp" successfully rolled out
```

```bash
kubectl get pods
```

```
NAME                                   READY   STATUS        RESTARTS   AGE
kubernetes-bootcamp-5cc66bcc9b-52rqr   1/1     Terminating   0          2m7s
kubernetes-bootcamp-5cc66bcc9b-9sprk   1/1     Terminating   0          63s
kubernetes-bootcamp-7d5c7d7dc4-5v4nc   1/1     Running       0          1s
kubernetes-bootcamp-7d5c7d7dc4-f2m77   1/1     Running       0          10s
kubernetes-bootcamp-7d5c7d7dc4-hldsf   1/1     Running       0          10s
kubernetes-bootcamp-7d5c7d7dc4-tz9k6   1/1     Running       0          2s
```

Old Pods (`5cc66bcc9b`) terminate only as new Pods (`7d5c7d7dc4`) come up — the app
never goes fully down. Verify the new version is serving:

```bash
curl http://$(minikube ip):31655
```

```
Hello Kubernetes bootcamp! | Running on: kubernetes-bootcamp-7d5c7d7dc4-hldsf | v=2
Hello Kubernetes bootcamp! | Running on: kubernetes-bootcamp-7d5c7d7dc4-5v4nc | v=2
```

`v=1` has become `v=2`.

### Rollback

```bash
kubectl rollout history deployments/kubernetes-bootcamp
kubectl rollout undo deployments/kubernetes-bootcamp
kubectl rollout status deployments/kubernetes-bootcamp
```

```
deployment.apps/kubernetes-bootcamp
REVISION  CHANGE-CAUSE
1         <none>
2         <none>

deployment.apps/kubernetes-bootcamp rolled back
deployment "kubernetes-bootcamp" successfully rolled out
```

```bash
curl http://$(minikube ip):31655
```

```
Hello Kubernetes bootcamp! | Running on: kubernetes-bootcamp-5cc66bcc9b-8dd28 | v=1
Hello Kubernetes bootcamp! | Running on: kubernetes-bootcamp-5cc66bcc9b-k9bfx | v=1
```

```bash
kubectl get rs -l app=kubernetes-bootcamp
```

```
NAME                             DESIRED   CURRENT   READY   AGE
kubernetes-bootcamp-5cc66bcc9b   4         4         4       2m38s
kubernetes-bootcamp-7d5c7d7dc4   0         0         0       41s
```

The old ReplicaSet is scaled back to 4 and the v2 ReplicaSet to 0. Kubernetes keeps old
ReplicaSets around precisely so a rollback is instant — this is the mechanism behind
`rollout undo`.

### Screenshot

![rolling update and rollback](images/06-rolling-update.png)

---

## Declarative Approach — YAML Manifests

Everything above used imperative commands. The same objects defined declaratively live
in [`manifests/`](manifests):

| File | Object |
|---|---|
| `00-namespace.yaml` | Namespace `k8s-fundamentals` |
| `01-pod.yaml` | A bare Pod with resource requests and limits |
| `02-replicaset.yaml` | ReplicaSet with 2 replicas |
| `03-deployment.yaml` | Deployment with 3 replicas |
| `04-service.yaml` | NodePort Service fronting the Deployment |

```bash
kubectl apply -f manifests/
```

```
namespace/k8s-fundamentals created
pod/nginx-demo-pod created
replicaset.apps/nginx-demo-rs created
deployment.apps/nginx-demo-deploy created
service/nginx-demo-svc created
```

```bash
kubectl get all -n k8s-fundamentals -o wide
```

```
NAME                                     READY   STATUS    RESTARTS   AGE   IP            NODE
pod/nginx-demo-deploy-574b4fff95-k5bsc   1/1     Running   0          24s   10.244.0.55   minikube
pod/nginx-demo-deploy-574b4fff95-qppwl   1/1     Running   0          23s   10.244.0.56   minikube
pod/nginx-demo-deploy-574b4fff95-qzcxz   1/1     Running   0          25s   10.244.0.54   minikube
pod/nginx-demo-pod                       1/1     Running   0          25s   10.244.0.53   minikube
pod/nginx-demo-rs-dcfdh                  1/1     Running   0          69s   10.244.0.48   minikube
pod/nginx-demo-rs-jwbmf                  1/1     Running   0          69s   10.244.0.49   minikube

NAME                     TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE   SELECTOR
service/nginx-demo-svc   NodePort   10.99.127.122   <none>        80:30081/TCP   25s   app=nginx-deploy

NAME                                READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES
deployment.apps/nginx-demo-deploy   3/3     3            3           69s   nginx        nginx:1.25-alpine

NAME                                           DESIRED   CURRENT   READY   AGE
replicaset.apps/nginx-demo-deploy-574b4fff95   3         3         3       25s
replicaset.apps/nginx-demo-rs                  2         2         2       69s
```

```bash
curl http://$(minikube ip):30081
kubectl get endpoints nginx-demo-svc -n k8s-fundamentals
```

```
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>

NAME             ENDPOINTS                                      AGE
nginx-demo-svc   10.244.0.54:80,10.244.0.55:80,10.244.0.56:80   33s
```

The Service's three endpoints exactly match the three Deployment Pod IPs.

### Self-healing demonstration

Deleting a Pod owned by a ReplicaSet does not remove it — the controller notices the gap
between desired (2) and actual (1) and creates a replacement:

```bash
kubectl get pods -n k8s-fundamentals -l app=nginx-rs
kubectl delete pod nginx-demo-rs-dcfdh -n k8s-fundamentals
kubectl get pods -n k8s-fundamentals -l app=nginx-rs
```

```
NAME                  READY   STATUS    RESTARTS   AGE
nginx-demo-rs-dcfdh   1/1     Running   0          78s
nginx-demo-rs-jwbmf   1/1     Running   0          78s

pod "nginx-demo-rs-dcfdh" deleted from k8s-fundamentals namespace

NAME                  READY   STATUS    RESTARTS   AGE
nginx-demo-rs-jwbmf   1/1     Running   0          89s
nginx-demo-rs-zcgrg   1/1     Running   0          11s     <-- new pod, created automatically
```

This is the reconciliation loop in action, and the practical reason Pods are managed
through controllers instead of being created directly.

### Screenshot

![declarative manifests](images/07-declarative.png)

---

## Issues Faced & Fixes

While applying the manifests the first time, two things failed.

**1. `ErrImagePull` on `nginx:1.27-alpine`**

```
Failed to pull image "nginx:1.27-alpine": failed to resolve reference
"docker.io/library/nginx:1.27-alpine": failed to authorize: failed to fetch
anonymous token: dial tcp: lookup auth.docker.io on 192.168.65.254:53: no such host
```

*Root cause:* DNS resolution from inside the Minikube node to `auth.docker.io` failed
temporarily, so containerd could not get a Docker Hub pull token.
*Fix:* switched the manifests to `nginx:1.25-alpine`, which was already in the node's
image cache (checked with `minikube ssh -- sudo crictl images`), so no registry call is
needed.

**2. `provided port is already allocated`**

```
The Service "nginx-demo-svc" is invalid: spec.ports[0].nodePort:
Invalid value: 30080: provided port is already allocated
```

*Root cause:* NodePort `30080` was already taken by an existing `nginx-service` in the
`default` namespace. NodePorts are allocated cluster-wide, not per namespace.
*Fix:* changed the manifest to `nodePort: 30081`.

---

## Cleanup

```bash
kubectl delete -f manifests/
kubectl delete deployment kubernetes-bootcamp
kubectl delete service kubernetes-bootcamp
minikube stop
```

---

## Conclusion

Minikube was installed and configured with the Docker driver, and the cluster was
verified healthy — node `Ready`, control-plane components `Healthy`, all `kube-system`
Pods `Running`. Exploring the architecture showed how apiserver, etcd, scheduler and
controller-manager divide the work on the control plane, and how kubelet, kube-proxy and
containerd carry it out on the node.

The hands-on tutorial made the core abstraction concrete: a **Deployment** owns a
**ReplicaSet**, which owns **Pods**, and a **Service** gives those Pods a stable address.
Scaling, rolling updates and rollbacks all work by the controller changing replica counts
across ReplicaSets, never by mutating a running container. The self-healing demo showed
the reconciliation loop directly — delete a Pod and Kubernetes puts it back, because the
declared desired state is what matters, not the current state.
