# GitOps demo — Argo CD, a Git repository, and continuous reconciliation

A working GitOps setup: a Git server, a repository holding the desired state,
and Argo CD keeping the cluster in agreement with it — tested by breaking the
agreement on purpose, three different ways.

Every block of output below was captured from the running cluster.

---

## What is GitOps?

GitOps is operating infrastructure by **changing a Git repository** rather than
by running commands against a cluster.

The usual deployment model is *push*: CI finishes, then something with cluster
credentials runs `kubectl apply`. Session 16 and 17 both did exactly that — the
pipeline had a kubeconfig and pushed changes in.

GitOps inverts it to *pull*: an agent **inside** the cluster watches a
repository and applies what it finds. CI no longer deploys; it only produces
artifacts and updates the repo. The cluster pulls.

Four properties follow, and they are the whole argument:

| Property | What it means |
|----------|---------------|
| **Declarative** | The repository describes the desired *state*, not the steps to reach it |
| **Versioned** | Every change to production is a commit — authored, reviewed, revertible |
| **Pulled automatically** | An in-cluster agent applies approved changes; nothing outside holds cluster credentials |
| **Continuously reconciled** | The agent does not apply once and stop. It keeps checking, forever |

That last one is what separates GitOps from "we keep our YAML in Git". Storing
manifests in a repository and applying them by hand is version control.
GitOps is the loop that *makes the cluster match*, and keeps making it match.

---

## Git as the source of truth

"Source of truth" is a precise claim, not a slogan. It means:

**If it is not in Git, it is not real.** A resource created by hand is drift,
and will be removed. A field edited with `kubectl` is drift, and will be
reverted.

Which means:

- **The repository answers "what is running in production?"** — without cluster
  access, and correctly, because anything that disagreed has already been
  corrected.
- **Every production change has an author, a timestamp and a reason.** Not an
  audit log of API calls, but a commit with a message and a reviewer.
- **Rollback is `git revert`.** Not a runbook, not a remembered command —
  reverting the commit restores the previous state through the same path that
  deployed it.
- **Access control is pull-request review.** Merge rights replace cluster
  credentials, and the number of people who need `kubectl` access drops close
  to zero.

The last point is the security one, and it is understated. In the push model
every CI runner holds credentials that can change production. In the pull
model, the agent's credentials never leave the cluster and CI holds nothing.

---

## Declarative configuration

Declarative means **describing the destination, not the journey**.

```bash
# imperative — a sequence of steps
kubectl create deployment guestbook --image=monitoring-demo:1.0.0
kubectl scale deployment guestbook --replicas=4
kubectl set env deployment/guestbook APP_VERSION=gitops-v2
```

```yaml
# declarative — a description of the end state
spec:
  replicas: 4
  template:
    spec:
      containers:
        - name: guestbook
          image: monitoring-demo:1.0.0
          env:
            - name: APP_VERSION
              value: "gitops-v2"
```

Run the imperative version twice and the second run errors — the Deployment
already exists. Apply the declarative version twice and the second is a no-op,
because it describes a state that already holds.

**That idempotence is what makes continuous reconciliation possible at all.**
An agent can apply the same manifest every three minutes, forever, and the only
time anything happens is when reality has diverged. A sequence of commands
could not be re-run that way.

It is the same property Terraform relies on in Sessions 18 and 19 — and the
same reason `terraform apply` on unchanged configuration reports *No changes*
rather than building a second copy of everything.

---

## Continuous reconciliation

The loop, as Argo CD actually runs it:

```
        ┌──────────────────────────────────────────────┐
        │                                              │
        │   1. read desired state from Git             │
        │              ↓                               │
        │   2. read live state from the Kubernetes API │
        │              ↓                               │
        │   3. diff them                               │
        │              ↓                               │
        │   4. different?  ──no──▶  mark Synced, wait  │
        │         │                                    │
        │        yes                                   │
        │         ↓                                    │
        │   5. apply the difference                    │
        │         │                                    │
        └─────────┴────────────────────────────────────┘
                  every 3 minutes, and on every webhook
```

Two settings turn that loop from advisory into authoritative:

```yaml
syncPolicy:
  automated:
    prune: true      # delete what Git no longer contains
    selfHeal: true   # revert what the cluster has that Git did not ask for
```

- **Without `prune`**, deleting a file leaves its resources running forever.
  Git stops being the source of truth the moment something can be added but
  never removed.
- **Without `selfHeal`**, Argo notices drift and reports it, but leaves it.
  Useful as a staging posture; not GitOps.

With both on, `kubectl scale` becomes a change that survives about six seconds.

---

## The GitOps workflow

```
  developer                  Git                    cluster
      │                       │                        │
      │  1. branch, edit YAML │                        │
      │──────────────────────▶│                        │
      │                       │                        │
      │  2. pull request      │                        │
      │     review + approve  │                        │
      │                       │                        │
      │  3. merge to main     │                        │
      │──────────────────────▶│                        │
      │                       │                        │
      │                       │  4. Argo CD polls      │
      │                       │◀───────────────────────│
      │                       │                        │
      │                       │  5. applies the diff   │
      │                       │───────────────────────▶│
      │                       │                        │
      │                       │  6. keeps checking ────│
      │                       │◀───────────────────────│
```

Nobody runs `kubectl apply`. Nobody outside the cluster holds a kubeconfig.
The deployment mechanism is `git merge`.

**Where CI fits.** CI still builds, tests and scans — everything Session 17's
pipeline did. What changes is the last step: instead of deploying, it commits
the new image tag to the config repository. The pipeline's output is a commit,
and the deployment happens because of it rather than inside it.

**The two-repository convention**: application source in one repo, deployment
manifests in another. It keeps application history separate from deployment
history, and avoids the loop where CI commits to the repo that triggers CI.

---

## What is deployed here

```
namespace: gitops             Gitea — the Git server
namespace: argocd             Argo CD v2.13.2, 7 pods
namespace: gitops-demo        the application Argo manages
                              ↑ created by Argo, not by hand
```

| File | Holds |
|------|-------|
| `gitea.yaml` | The in-cluster Git server |
| `apps/guestbook.yaml` | **The desired state.** The file Argo reads |
| `argocd/application.yaml` | The Argo CD `Application` — where to look, and how hard to insist |

### Why the Git server runs in the cluster

GitOps needs a repository that can be committed to freely. Running Gitea inside
the cluster makes this demo self-contained — no external account, no
credentials, no network dependency — and, more usefully, it makes the **full
commit → reconcile cycle** demonstrable rather than merely described.

In production the repository is GitHub or GitLab. Nothing about the Argo CD
configuration changes; only `repoURL` does.

### The Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  source:
    repoURL: http://gitea-http.gitops.svc.cluster.local:3000/palak/gitops-demo.git
    targetRevision: HEAD
    path: apps

  destination:
    server: https://kubernetes.default.svc
    namespace: gitops-demo

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

Note what it does **not** contain: any description of the guestbook itself.
Argo does not need telling what the application looks like — that is in Git.
This object only says *where to look* and *how hard to insist*.

The Application is itself a Kubernetes manifest that lives in Git. That is the
"app of apps" idea: even the thing that does the deploying is declared
declaratively.

---

## Setting it up

```bash
# 1. Argo CD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.2/manifests/install.yaml

# 2. the Git server
kubectl apply -f gitea.yaml
kubectl exec -n gitops deploy/gitea -- gitea admin user create \
  --username palak --password "$GITEA_PW" --email palak@example.invalid --admin

# 3. the repository
curl -u "palak:$GITEA_PW" -X POST http://localhost:3000/api/v1/user/repos \
  -H "Content-Type: application/json" \
  -d '{"name":"gitops-demo","default_branch":"main"}'

# 4. push the desired state
git init -b main && git add apps/ && git commit -m "Initial desired state"
git push -u origin main

# 5. point Argo at it
kubectl apply -f argocd/application.yaml
```

The repository, immediately after step 4:

```
$ git log --oneline
656a23b Initial desired state: guestbook at 2 replicas
```

---

## The first sync

Argo CD created the namespace, the Deployment and the Service from the commit
alone — nothing was applied by hand:

```
$ kubectl get app guestbook -n argocd
NAME        SYNC     HEALTH        REVISION
guestbook   Synced   Progressing   656a23b051ebc2e71beade68c7eeaae3a58464b8

$ kubectl get all -n gitops-demo
NAME                             READY   STATUS              RESTARTS   AGE
pod/guestbook-5bc88bbd9b-lrxxh   0/1     Running             0          3s
pod/guestbook-5bc88bbd9b-v6hkn   0/1     ContainerCreating   0          3s

NAME                TYPE        CLUSTER-IP      PORT(S)   AGE
service/guestbook   ClusterIP   10.105.28.186   80/TCP    4s

NAME                        READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/guestbook   0/2     2            0           3s
```

Argo tracks each managed object individually:

```
$ kubectl get app guestbook -n argocd -o jsonpath='{range .status.resources[*]}...'
Service/guestbook      status=Synced  health=Healthy
Deployment/guestbook   status=Synced  health=Healthy
```

**`Synced` and `Healthy` are different questions.** *Synced* means the live
object matches Git. *Healthy* means the object is actually working — a
Deployment with its replicas available. A Deployment can be perfectly Synced
and Degraded, which is exactly what you want to be able to distinguish: "we
deployed what was asked for, and it is failing" is a different problem from
"we failed to deploy".

---

## Reconciliation, tested three ways

### Test 1 — change the cluster by hand

```
$ kubectl get deploy guestbook -n gitops-demo -o jsonpath='{.spec.replicas}'
2                                                     ← what Git says

$ kubectl scale deploy/guestbook -n gitops-demo --replicas=5     23:05:10
deployment.apps/guestbook scaled
immediately after: replicas=5

$ # ...no further commands were run...
self-healed back to 2 at                                         23:05:16
```

**Six seconds.** Nobody intervened. The scale was not rejected — it was applied
and then undone, because Argo compared the cluster to Git and Git won.

### Test 2 — delete a resource outright

```
$ kubectl delete svc guestbook -n gitops-demo                    23:05:16
service "guestbook" deleted from gitops-demo namespace

$ kubectl get svc -n gitops-demo
No resources found in gitops-demo namespace.

$ # ...no further commands were run...
Argo recreated it at                                             23:05:19
guestbook   ClusterIP   10.101.218.146   <none>   80/TCP   2s
```

**Three seconds**, and note the new ClusterIP — Argo did not restore a backup,
it re-created the object from the manifest in Git. The Service is defined by
the file, so a new one built from that file is as correct as the original.

### Test 3 — change Git, and touch nothing else

This is the direction that matters. A commit, a push, and then deliberately no
intervention at all:

```
$ sed -i 's/replicas: 4/replicas: 3/' apps/guestbook.yaml
$ git commit -m "Scale guestbook down to 3 replicas"
$ git push origin main
pushed def7054 at 23:08:51 - NO refresh will be forced
```

```
cluster followed Git after 247s, with no manual trigger
```

At the moment the loop caught it, Argo was mid-apply:

```
$ kubectl get app guestbook -n argocd
SYNC        REVISION
OutOfSync   def705480a05fa6edcef1424a65a742edb001683
```

and once the rollout finished:

```
SYNC     HEALTH    REVISION
Synced   Healthy   def705480a05fa6edcef1424a65a742edb001683

replicas=3  version=gitops-v2

guestbook-6756db98f9-5grzj   1/1   Running
guestbook-6756db98f9-gjvpt   1/1   Running
guestbook-6756db98f9-nqm42   1/1   Running
```

**247 seconds, with nothing run against the cluster.** The only action taken
was `git push`. That is longer than Argo's nominal 3-minute poll because the
interval is measured from the last reconciliation, not from the commit — a
push that lands just after a poll waits almost a full cycle for the next one.

In production that delay is removed with a **webhook**: the Git server tells
Argo a push happened, and the sync starts in seconds. Polling is the fallback
for when the webhook is missed, which is exactly why it still exists.

```
$ kubectl get app guestbook -n argocd -o jsonpath='{range .status.history[*]}...'
0  656a23b051ebc2e71beade68c7eeaae3a58464b8  2026-10-07T17:34:59Z
1  55658e91e1b2c2bab55f9356ce2f5fc5dad81b70  2026-10-07T17:38:10Z
2  def705480a05fa6edcef1424a65a742edb001683  2026-10-07T17:42:57Z
```

A deployment history where each entry is a Git commit. "What changed in
production, when, and who approved it" is `git log`.

### A note on honesty about test 3

An earlier run of this test is **not** quoted above, because it was
inconclusive. A commit was pushed and a hard refresh
(`argocd.argoproj.io/refresh=hard`, which is what a webhook triggers in
production) was issued within seconds of the natural poll landing. The cluster
converged, but there was no way to tell which caused it.

The run above was redone with no refresh and no intervention of any kind, so
the elapsed time is genuinely Argo's own polling interval.

---

## Kubernetes + GitOps

The pairing is not a coincidence. Kubernetes is already a reconciliation engine
— a Deployment controller spends its life comparing desired replicas to actual
replicas and correcting the difference. GitOps extends that same loop one step
further out, so the desired state lives in Git instead of etcd:

```
   Git  ──▶  Argo CD  ──▶  etcd  ──▶  Kubernetes controllers  ──▶  pods
        reconcile                 reconcile
```

Everything Kubernetes needs for this it already has:

| Kubernetes property | Why GitOps needs it |
|---------------------|---------------------|
| Everything is a declarative API object | There is something to put in Git |
| `apply` is idempotent | The same manifest can be applied forever |
| Controllers already reconcile | GitOps adds a layer, it does not invent the idea |
| Resources are namespaced and labelled | An agent can tell what it owns |
| CRDs | `Application` is itself a Kubernetes object |

### The tools

| Tool | Notes |
|------|-------|
| **Argo CD** | CNCF graduated. UI-first, `Application` CRD, multi-cluster, SSO. Used here |
| **Flux** | CNCF graduated. No UI, more composable, GitOps Toolkit controllers |
| **Kustomize / Helm** | How environments differ without duplicating manifests. Both are first-class Argo sources |
| **Sealed Secrets / External Secrets** | Secrets cannot go in Git in plaintext. Either encrypt them so only the cluster can decrypt, or keep a reference and fetch the value at apply time |

Secrets are the part most GitOps introductions skip. "Everything in Git"
collides immediately with "never commit a credential", and the answer is not to
make an exception — it is to commit something that is useless without the
cluster's private key.

---

## Issues faced & fixes

| # | Problem | Cause | Fix |
|---|---------|-------|-----|
| 1 | Argo CD pods stuck in `ImagePullBackOff`: `lookup quay.io on 192.168.65.254:53: server misbehaving` | Docker Desktop's DNS resolver inside the minikube VM was intermittently failing | Kubernetes' own pull backoff eventually succeeded, and all 7 pods came up. Adding `8.8.8.8` to the VM's `/etc/resolv.conf` did **not** help — it is unreachable from inside Docker Desktop's network — so that edit was reverted |
| 2 | `minikube ssh -- docker pull` failed with `dial unix /var/run/docker.sock: no such file or directory` | minikube runs **containerd**, not Docker, so there is no Docker socket inside the VM | Used `minikube image pull` instead, which talks to whatever runtime the node actually has |
| 3 | `sudo sed -i` on `/etc/resolv.conf` failed with `cannot rename: Device or resource busy` | `sed -i` writes a temp file and renames over the original; the file is a bind mount, which cannot be replaced that way | Rewrote the contents in place (`grep -v … > /tmp/rc && cat /tmp/rc > /etc/resolv.conf`) rather than replacing the inode |
| 4 | The first commit→sync test was inconclusive | A forced refresh was issued at almost the same moment as the natural poll landed | Re-ran the test with no intervention. The ambiguous run is described above rather than quietly replaced |

---

## Commands

```bash
# --- Argo CD -------------------------------------------------------------
kubectl get pods -n argocd
kubectl get app guestbook -n argocd
kubectl get app guestbook -n argocd -o yaml

# the UI, at https://localhost:8443  (user: admin)
kubectl port-forward -n argocd svc/argocd-server 8443:443
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d

# --- what Argo manages ---------------------------------------------------
kubectl get all -n gitops-demo
kubectl get app guestbook -n argocd \
  -o custom-columns='SYNC:.status.sync.status,HEALTH:.status.health.status,REV:.status.sync.revision'

# --- prove self-heal -----------------------------------------------------
kubectl scale deploy/guestbook -n gitops-demo --replicas=5
kubectl get deploy guestbook -n gitops-demo -w     # watch it return to what Git says

kubectl delete svc guestbook -n gitops-demo
kubectl get svc -n gitops-demo -w                  # watch it come back

# --- prove the forward loop ----------------------------------------------
# edit apps/guestbook.yaml, then:
git commit -am "Change the desired state" && git push
kubectl get app guestbook -n argocd -w

# --- force a sync (what a webhook does in production) --------------------
kubectl annotate app guestbook -n argocd argocd.argoproj.io/refresh=hard --overwrite

# --- Gitea ---------------------------------------------------------------
kubectl port-forward -n gitops svc/gitea-http 3000:3000
curl -s http://localhost:3000/api/v1/repos/palak/gitops-demo/branches/main
```
