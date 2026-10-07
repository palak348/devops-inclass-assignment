# Session 17 — Complete CI/CD & DevSecOps

## Student Information

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

---

## Objective

Build a complete CI/CD **plus DevSecOps** pipeline for a real application: build it,
test it, scan it four different ways, gate on the results, publish the image only
if the gate is green, and deploy it to Kubernetes.

The difference between this and Session 16 is the word **Sec**. Session 16 asked
"does it build and does it work?". This session adds the question that matters once
the code is in front of users: **"is it safe to ship?"** — and makes the pipeline
refuse to ship when the answer is no.

---

## Required Flow — and where each stage lives

```
Code                       git push
  |
Build                      job 1  - npm ci from the lockfile, syntax check
  |
Unit Test                  job 2  - node --test, 17 tests
  |
SAST                       job 3  - Semgrep       (our own source code)
  |
SCA                        job 4  - npm audit + Trivy fs (borrowed code)
  |
Secret Scan                job 5  - Gitleaks      (working tree + git history)
  |
Docker Build               job 6  - buildx, exported as a tar, NOT pushed
  |
Container Image Scan       job 7  - Trivy image   (the OS layer + the image)
  |
SECURITY GATE              job 8  - collects all four verdicts, fails the run
  |
Push Image                 job 9  - GHCR, only reachable through a green gate
  |
Deploy to Kubernetes       job 10 - pin image, validate manifests, apply
```

All ten stages are real jobs in `.github/workflows/devsecops.yml`.

---

## Folder Structure

```
DevSecOps/
├── readme.md
├── app/
│   ├── package.json            express 4.22.3, scripts: start/test/lint/audit
│   ├── package-lock.json       the exact dependency tree the scans check
│   ├── Dockerfile              3 stages, non-root, npm stripped from runtime
│   ├── .dockerignore
│   ├── src/
│   │   ├── server.js           routes, security headers, escaped HTML view
│   │   ├── notes.js            validation + HTML escaping
│   │   └── auth.js             bearer auth, constant-time token compare
│   └── tests/
│       ├── notes.test.js       7 tests
│       ├── auth.test.js        5 tests
│       └── api.test.js         5 tests (real HTTP against the app)
├── security/
│   ├── semgrep.yml             6 custom SAST rules
│   ├── gitleaks.toml           secret-scanning rules + reviewed allowlist
│   ├── trivy.yaml              severity policy for SCA and image scanning
│   └── .trivyignore            the accepted-risk register (currently empty)
├── k8s/
│   ├── 00-namespace.yaml       Pod Security Admission: restricted
│   ├── 01-secret.yaml          placeholder token, real one injected at deploy
│   ├── 02-deployment.yaml      hardened securityContext + 3 probes
│   ├── 03-service.yaml         NodePort 30171
│   └── 04-networkpolicy.yaml   default-deny + a narrow allow
└── images/                     screenshots

.github/workflows/devsecops.yml  ← the pipeline (must live at the REPO ROOT)
```

> **Why the workflow is not in this folder:** GitHub Actions only discovers
> workflows in `.github/workflows/` at the top of the repository. A YAML file
> inside a project folder is just a YAML file. Same lesson as Session 16.

---

## The Application

A small notes API, deliberately written so that each security control has
something real to protect.

| Route | Method | Auth | What it does |
|-------|--------|------|--------------|
| `/health` | GET | no | liveness — is the process up |
| `/ready` | GET | no | readiness — 503 if `API_TOKEN` is missing |
| `/api/notes` | GET | no | list notes |
| `/api/notes/:id` | GET | no | fetch one note |
| `/api/notes` | POST | **yes** | create a note (validated) |
| `/api/notes/:id` | DELETE | **yes** | delete a note |
| `/` | GET | no | HTML view, every value escaped |

Security decisions written into the code, each one backed by a test:

- **No hardcoded secret.** `API_TOKEN` comes from the environment, which in
  Kubernetes comes from a Secret. A missing token **fails closed** — writes are
  refused and `/ready` returns 503, so the pod never joins the Service.
- **Constant-time token comparison.** `auth.safeCompare()` wraps
  `crypto.timingSafeEqual`. A plain `===` returns faster the earlier it finds a
  mismatch, which lets an attacker recover the token one character at a time.
- **Output escaping.** Every value rendered into HTML goes through
  `notes.escapeHtml()`, so a note titled `<script>alert(1)</script>` is displayed
  as text instead of executing. This is stored XSS, and the test asserts it.
- **Input validation at the edge.** Type, emptiness and length are checked before
  anything is stored.
- **Bounded request body.** `express.json({ limit: '64kb' })` — an unbounded body
  parser is a free denial-of-service.
- **Security headers**, including removing `X-Powered-By` so the service stops
  advertising its framework and version.

```
$ npm test
# tests 17
# pass 17
# fail 0
```

---

## The Dockerfile — three stages, and why

| Stage | Purpose | Why it matters |
|-------|---------|----------------|
| `deps` | `npm ci --omit=dev` | `ci` installs **exactly** the lockfile. `npm install` can silently bump a transitive dependency, which makes the SCA scan a scan of something other than what ships. |
| `test` | installs dev deps, runs `npm test` | A failing test means the build stops here — the runtime image is never produced at all. |
| `runtime` | the shipped image | No build tools, no test files, no git metadata, **no package manager**, and it does not run as root. |

Two hardening steps worth calling out:

**1. Non-root.** The image reuses the `node` user (uid 1000) that the base image
already ships, rather than inventing one.

```
$ docker exec dsec-test id
uid=1000(node) gid=1000(node) groups=1000(node)
```

**2. npm is deleted from the runtime stage.**

```dockerfile
USER root
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER node
```

This was not a guess — the image scan demanded it. See *Container Image Scan*
below. The container never installs anything at run time, so npm is pure attack
surface: it carries its own dependency tree of CVEs, and it hands anyone who gets
inside the container a tool for downloading more.

---

## Security Tools

Four tools, because they answer four different questions. None of them replaces
another.

| Stage | Tool | Question it answers | Config |
|-------|------|---------------------|--------|
| SAST | Semgrep | Is **our** code dangerous? | `security/semgrep.yml` |
| SCA | npm audit + Trivy fs | Is the **borrowed** code known-bad? | `security/trivy.yaml` |
| Secret Scan | Gitleaks | Did a credential get committed — ever? | `security/gitleaks.toml` |
| Image Scan | Trivy image | Is the **base image** we inherited vulnerable? | `security/trivy.yaml` |

---

### 1. SAST — Semgrep

Static Application Security Testing reads the source **without running it** and
looks for dangerous shapes. The pipeline runs two community rulesets
(`p/javascript`, `p/security-audit`) plus six project rules in
`security/semgrep.yml`:

| Rule | Catches |
|------|---------|
| `no-hardcoded-secret` | a credential assigned to a literal |
| `no-eval` | `eval()` / `new Function()` — remote code execution |
| `no-shell-injection` | `child_process.exec()`, which goes through a shell |
| `no-unescaped-render` | a request value written straight into HTML |
| `no-timing-unsafe-token-compare` | a secret compared with `===` |
| `no-disabled-tls-verification` | `rejectUnauthorized: false` |

The community rules catch the well-known bug classes. The project rules encode
the decisions **this** codebase made, so a future change that quietly undoes one
of them fails the build instead of slipping through review.

**Result on the application — clean:**

```
Scanning 3 files with 6 js rules.
✅ Scan completed successfully.
 • Findings: 0 (0 blocking)
 • Rules run: 6
```

**Proof the rules actually fire.** A passing scan proves nothing on its own — a
rule with a typo in it also finds zero problems. So the same rules were run
against a deliberately bad file:

```js
const API_KEY = "sk-live-abcdef0123456789";
cp.exec("ls " + req.query.dir);
eval(req.body.code);
function check(t) { return t === process.env.API_TOKEN; }
const opts = { rejectUnauthorized: false };
```

```
┌─────────────────┐
│ 5 Code Findings │
└─────────────────┘
   ❯❯❱ no-hardcoded-secret              1┆ const API_KEY = "sk-live-abcdef0123456789";
   ❯❯❱ no-shell-injection               4┆ cp.exec("ls " + req.query.dir);
   ❯❯❱ no-eval                          5┆ eval(req.body.code);
    ❯❱ no-timing-unsafe-token-compare   7┆ function check(t) { return t === process.env.API_TOKEN; }
   ❯❯❱ no-disabled-tls-verification     8┆ const opts = { rejectUnauthorized: false };

 • Findings: 5 (5 blocking)
```

---

### 2. SCA — npm audit + Trivy filesystem

The app is ~70 packages and three of them are mine. **SCA asks the question SAST
cannot:** is any of that borrowed code known to be vulnerable? Two tools are used
because they read different advisory databases — npm audit uses the GitHub
Advisory Database, Trivy aggregates several others.

**This gate caught a real problem.** The first version of the app pinned
`express@4.21.2`:

```
$ npm audit --audit-level=high

path-to-regexp  <0.1.13
Severity: high
path-to-regexp vulnerable to Regular Expression Denial of Service via multiple
route parameters - https://github.com/advisories/GHSA-37ch-88jc-xwx2

body-parser  <=1.20.6     Severity: moderate   (DoS, invalid limit silently disables size enforcement)
qs  <=6.15.3              Severity: moderate   (arrayLimit bypass → DoS)

4 vulnerabilities (2 moderate, 2 high)
exit=1
```

Two HIGH findings, none of them in code I wrote — all of them inherited through
Express. **Fix:** upgrade to `express@4.22.3`.

```
$ npm audit --audit-level=high
found 0 vulnerabilities
exit=0
```

That is the whole point of SCA in one before-and-after.

---

### 3. Secret Scan — Gitleaks

Gitleaks scans the working tree **and the full git history**. The history part is
the point: deleting a leaked key in a later commit does not unleak it, because the
old commit still holds it and anyone who clones the repo gets it. That is why the
job checks out with `fetch-depth: 0` — a shallow clone would hide exactly the
commit you are looking for.

The config extends the ~170 built-in rules and adds two project rules
(`kubernetes-secret-plaintext`, `dotenv-committed`).

**This scan also found something.** Run across the whole repository, it reported
four hits:

```
kubernetes-secret-plaintext | Helm/mini-project/guestbook/values.yaml                    | "changeme"
kubernetes-secret-plaintext | Kubernetes Ingress, ConfigMaps & Secrets/02-secret/...     | "S3cr3tP@ssw0rd!"
generic-api-key             | Kubernetes Ingress, ConfigMaps & Secrets/readme.md:345     | API_KEY
generic-api-key             | Kubernetes Ingress, ConfigMaps & Secrets/readme.md:346     | DB_PASSWORD
```

Every one is a deliberately fake teaching value from Sessions 12 and 15, and none
unlocks anything. They were checked by hand and then excused **by path, with the
reason written down**, in a dedicated `[[allowlists]]` block — rather than by
weakening the rules so they stop looking. An allowlist that grows without
justification is how a scanner quietly stops being useful.

```
$ gitleaks detect --source /repo --config security/gitleaks.toml --redact
INF no leaks found
exit=0
```

**Proof it still catches a real leak** — planting two files and rescanning:

```
dotenv-committed            | .env line 1              (API_TOKEN=...)
dotenv-committed            | .env line 2              (DB_PASSWORD=...)
kubernetes-secret-plaintext | app-secret.yaml line 1   (password: "...")
leaks found: 3   exit=1
```

---

### 4. Container Image Scan — Trivy

The first three scans never look at the base image. This one does, and it covers
the Alpine OS packages, everything in `node_modules`, and a second pass for
credentials baked into the layers.

**The first scan of the image failed the gate — 10 HIGH findings:**

```
devsecops-notes:1.0.0 (alpine 3.24.2) -> 0 findings
Node.js                               -> 10 findings
    CVE-2026-102276  brace-expansion  HIGH
    CVE-2026-102278  brace-expansion  HIGH
    CVE-2026-13149   brace-expansion  HIGH
    CVE-2026-14257   brace-expansion  HIGH
    CVE-2026-69152   brace-expansion  HIGH
    CVE-2026-69192   ip-address       HIGH
    CVE-2026-9496    pacote           HIGH  (x2)
    CVE-2026-33671   picomatch        HIGH
    CVE-2026-48815   sigstore         HIGH
exit=1
```

Reading it carefully matters here. The **Alpine layer was clean**, and so was the
app's own `node_modules`. Every single finding came from
`/usr/local/lib/node_modules/npm` — the npm CLI that the `node:22-alpine` base
image ships, and npm's own dependency tree.

There were three options: suppress them in `.trivyignore` (dishonest — they are
real packages, really present); accept a failing gate (useless); or **remove the
thing that is not needed**. The runtime container never installs anything, so npm
was deleted in the runtime stage.

```
$ trivy image --severity HIGH,CRITICAL --ignore-unfixed --scanners vuln,secret devsecops-notes:1.0.0
...
Legend:
- '0': Clean (no security findings detected)
TRIVY_EXIT=0
```

Confirmed inside the running pod:

```
$ kubectl exec -n session17 $POD -- sh -c "which npm || echo 'not present'"
npm: NOT PRESENT (removed from the runtime image)
```

> **Note on image size:** the image is still 243 MB. Deleting files in a later
> layer removes them from the final *filesystem* — which is what Trivy scans and
> what an attacker would find — but the earlier layer still exists in the image
> history, so the size does not drop. Shrinking it would need a different base
> (distroless) or a squashed build.

> **`ignore-unfixed: true`** is set in `security/trivy.yaml`. A vulnerability with
> no released fix cannot be acted on today, so it does not block the pipeline. It
> is still printed, and the workflow re-runs weekly on a schedule to catch it the
> moment a fix lands.

---

## The Security Gate

The gate is the point of the whole exercise. Jobs 3, 4, 5 and 7 each **record** a
verdict instead of aborting the run, so one execution produces a complete security
report rather than stopping at the first problem. Job 8 then collects all four and
makes the single decision:

```bash
SAST="${SAST:-skipped}"      # an empty value means the job never ran
...
if [ "$SAST" = "pass" ] && [ "$SCA" = "pass" ] && \
   [ "$SECRETS" = "pass" ] && [ "$IMAGE" = "pass" ]; then
  echo "passed=true"  >> "$GITHUB_OUTPUT"
else
  echo "passed=false" >> "$GITHUB_OUTPUT"
  exit 1                      # nothing is published and nothing is deployed
fi
```

Two details that are easy to get wrong:

- **A skipped job counts as a failure.** If an earlier job dies, the later scan
  never runs and its output is empty. An unanswered security question is not a
  passing one, so `${VAR:-skipped}` turns that silence into a `fail`.
- **The gate is a job dependency, not a warning.** `push` declares
  `needs: security-gate`, so a red gate does not "flag" anything — the publish and
  deploy jobs simply never start.

**The first run proved the gate works — the hard way.** The SCA job failed for a
configuration reason (see *Issues Faced*, #8). Everything downstream behaved
exactly as designed:

```
1. Build                      -> success
2. Unit Test                  -> success
3. SAST (Semgrep)             -> success
4. SCA (npm audit + Trivy fs) -> failure
5. Secret Scan (Gitleaks)     -> skipped
6. Docker Build               -> skipped
7. Container Image Scan       -> skipped
8. Security Gate              -> FAILURE
9. Push Image to GHCR         -> skipped
10. Deploy to Kubernetes      -> skipped
```

No image was published and nothing was deployed. Note that the gate failed even
though three scanners had passed and the other two never ran: `${VAR:-skipped}`
turned that silence into a `fail`, which is the behaviour you want. A gate that
treats "we did not check" as "it is fine" is not a gate.

The gate writes its verdict table to the run summary:

| Stage | Tool | Verdict |
|-------|------|---------|
| SAST | Semgrep | `pass` |
| SCA | npm audit + Trivy fs | `pass` |
| Secret Scan | Gitleaks | `pass` |
| Image Scan | Trivy image | `pass` |

---

## Pipeline permissions

```yaml
permissions:
  contents: read        # every job starts read-only
```

Only job 9 asks for more, and only for what it needs:

```yaml
    permissions:
      contents: read
      packages: write   # the ONLY job allowed to write packages
```

`GITHUB_TOKEN` is minted per run and expires when the run ends, so there is no
long-lived registry credential stored anywhere. Least privilege applied to the
pipeline itself, not just to the application.

---

## Kubernetes Manifests — defence in depth

The pipeline is one layer. The cluster is another, and it keeps enforcing after
the pipeline has finished.

### Pod Security Admission — a gate inside the cluster

```yaml
  labels:
    pod-security.kubernetes.io/enforce: restricted
```

One label on the namespace, and the API server rejects any non-compliant pod —
including one applied by hand, which the pipeline could never police:

```
$ kubectl run psa-test --image=busybox:1.36 -n session17 \
    --overrides='{"spec":{"containers":[{"name":"psa-test","securityContext":{"privileged":true,"runAsUser":0}}]}}'

Error from server (Forbidden): pods "psa-test" is forbidden:
violates PodSecurity "restricted:latest":
  privileged (container "psa-test" must not set securityContext.privileged=true),
  allowPrivilegeEscalation != false,
  unrestricted capabilities (must set capabilities.drop=["ALL"]),
  runAsNonRoot != true,
  runAsUser=0 (must not set runAsUser=0),
  seccompProfile (must set seccompProfile.type to "RuntimeDefault" or "Localhost")
```

### Container hardening, as actually applied

```
$ kubectl get deploy notes-api -n session17 -o jsonpath='{...securityContext}'

pod:       {"fsGroup":1000,"runAsGroup":1000,"runAsNonRoot":true,"runAsUser":1000,
            "seccompProfile":{"type":"RuntimeDefault"}}
container: {"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]},
            "readOnlyRootFilesystem":true}
```

| Setting | What it buys |
|---------|--------------|
| `runAsNonRoot` + `runAsUser: 1000` | the kubelet refuses to start the container as root |
| `allowPrivilegeEscalation: false` | no setuid route back up to root |
| `readOnlyRootFilesystem: true` | an attacker cannot drop a binary or a webshell |
| `capabilities.drop: ["ALL"]` | start from zero kernel capabilities, add none |
| `seccompProfile: RuntimeDefault` | the dangerous syscalls are blocked |
| `automountServiceAccountToken: false` | no cluster credential in the pod to steal |
| `resources.limits` | one compromised pod cannot starve the node |

`readOnlyRootFilesystem` is not decoration:

```
$ kubectl exec -n session17 $POD -- touch /app/evil.js
touch: /app/evil.js: Read-only file system
command terminated with exit code 1
```

Because the filesystem is read-only, the pod gets one explicit scratch area —
an in-memory `emptyDir` mounted at `/tmp`, capped at 16Mi.

### NetworkPolicy — default deny

Kubernetes networking is wide open by default: every pod can reach every other
pod. `04-networkpolicy.yaml` inverts that with an empty `podSelector: {}` that
denies all ingress and egress, then allows exactly two things: inbound TCP 3000,
and outbound DNS to `kube-system`. Nothing else — the service makes no outbound
calls, so an attacker inside the pod has no route to a command-and-control server.

This cluster runs **kindnet**, whose policy agent enforces it, so both halves were
verified for real:

```
--- INGRESS: a pod in another namespace -> notes-api:3000 (allowed) ---
{"status":"healthy","version":"1.0.0"}

--- EGRESS: notes-api -> http://example.com (denied) ---
BLOCKED: no egress to example.com (timed out)
```

> A NetworkPolicy object is inert unless the CNI plugin implements it. On a plain
> bridge/ptp CNI the objects are stored but nothing is filtered — there you would
> start minikube with `--cni=calico`.

### Secrets

`01-secret.yaml` ships an obvious `CHANGE-ME-IN-PRODUCTION` placeholder on purpose.
**base64 in git is not encryption** — `base64 -d` undoes it instantly. The real
token is written at deploy time from a GitHub Actions secret:

```bash
kubectl create secret generic notes-api-secret \
  --from-literal=api-token="$API_TOKEN" -n session17
```

Anything genuinely sensitive belongs in Sealed Secrets, External Secrets or a
cloud KMS.

---

## Commands Used

### Local verification

```bash
cd "devops-class-main/DevSecOps/app"

npm ci                       # install exactly the lockfile
npm run lint                 # syntax check
npm test                     # 17 tests
npm audit --audit-level=high # SCA

docker build -t devsecops-notes:1.0.0 .
docker run -d --name dsec-test -p 3100:3000 \
  -e API_TOKEN=local-demo-token-1234567890 devsecops-notes:1.0.0

docker exec dsec-test id                  # uid=1000(node)
curl http://localhost:3100/health
curl -X POST http://localhost:3100/api/notes \
  -H "authorization: Bearer local-demo-token-1234567890" \
  -H "content-type: application/json" \
  -d '{"title":"<script>alert(1)</script>","body":"escaped on render"}'
curl http://localhost:3100/                # the title comes back escaped
```

### Running the scanners locally (no install needed — all three via Docker)

```bash
# SAST
docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep:latest \
  semgrep scan --config devops-class-main/DevSecOps/security/semgrep.yml \
  --error devops-class-main/DevSecOps/app/src

# Secret scan (whole repo + full history)
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect \
  --source /repo --config /repo/devops-class-main/DevSecOps/security/gitleaks.toml \
  --redact --verbose

# Container image scan
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest \
  image --severity HIGH,CRITICAL --ignore-unfixed --scanners vuln,secret \
  --exit-code 1 devsecops-notes:1.0.0
```

### Deploy to Kubernetes

```bash
minikube image load devsecops-notes:1.0.0

kubectl apply -f devops-class-main/DevSecOps/k8s/
kubectl set image deployment/notes-api notes-api=devsecops-notes:1.0.0 -n session17
kubectl rollout status deployment/notes-api -n session17

kubectl get pods,svc,netpol -n session17
minikube service notes-api -n session17 --url    # opens a tunnel, keep it running
```

```
NAME                             READY   STATUS    RESTARTS   AGE
pod/notes-api-6d88d596dc-hlvm7   1/1     Running   0          15s
pod/notes-api-6d88d596dc-hnmmv   1/1     Running   0          6s

NAME                TYPE       CLUSTER-IP     PORT(S)        AGE
service/notes-api   NodePort   10.109.3.229   80:30171/TCP   21s

NAME                                               POD-SELECTOR
networkpolicy.networking.k8s.io/default-deny-all   <none>
networkpolicy.networking.k8s.io/notes-api-allow    app=notes-api
```

---

## Screenshots

| File | What it shows |
|------|---------------|
| `images/01-devsecops-pipeline.png` | the Actions run graph — all ten jobs green, in order |
| `images/02-security-gate.png` | the Security Gate summary table with all four verdicts |
| `images/03-deployment.png` | `kubectl get pods,svc -n session17` and the app responding |

---

## Issues Faced & Fixes

| # | Problem | Cause | Fix |
|---|---------|-------|-----|
| 1 | `npm audit` returned 2 HIGH findings | `express@4.21.2` pulls a vulnerable `path-to-regexp` | upgraded to `express@4.22.3` — 0 vulnerabilities |
| 2 | Trivy image scan: 10 HIGH findings | the `node:22-alpine` base ships the npm CLI, whose own dependencies (pacote, sigstore, brace-expansion…) carry CVEs | deleted npm/npx from the runtime stage — a real fix, not a `.trivyignore` suppression |
| 3 | Semgrep: `Invalid YAML file semgrep.yml: mapping values are not allowed here` | the pattern `rejectUnauthorized: false` contains a colon, so YAML parsed it as a key | quoted the pattern |
| 4 | Gitleaks flagged the deliberate `CHANGE-ME-IN-PRODUCTION` placeholder | the singular `[allowlist]` block was not being applied to the custom rule | rewrote it as `[[allowlists]]` with `targetRules` and `regexTarget = "line"` |
| 5 | Gitleaks negative test found nothing | `AKIAIOSFODNN7EXAMPLE` is on the tool's own stopword list, and the `dotenv-committed` regex anchored with `^` without `(?m)` | used a realistic test value and added the `(?m)` multiline flag |
| 6 | Whole-repo scan: 4 leaks in Sessions 12 and 15 | teaching placeholders in earlier coursework | reviewed each by hand, excused them by path in a documented `[[allowlists]]` block |
| 7 | `kubectl apply --dry-run=server` failed on every file but the namespace | the namespace does not exist yet during a dry run | applied for real; the pipeline validates offline with `kubeconform` instead |
| 8 | First pipeline run: the SCA job failed at **"Set up job"**, before a single step ran | the action was referenced as `aquasecurity/trivy-action@0.28.0`, but the repository's tags carry a `v` prefix (`v0.28.0`), so the reference could not be resolved | pinned to `aquasecurity/trivy-action@v0.36.0`. A failure in *Set up job* is the giveaway: no step executed, so it is never the scan itself — it is the job definition |
| 9 | Second and third runs: every scan job went green but the **Security Gate still failed**, with nothing in the job list to say why | `continue-on-error: true` makes GitHub report a step's *conclusion* as success even when its *outcome* was failure, so the job list hides the real verdict | made each job print its verdict as a `::notice` annotation and the gate print `::error title=Security Gate FAILED::sast=… sca=… secrets=… image=…`. The annotation named the culprit immediately: `secrets=fail` |
| 10 | Gitleaks failed in CI on a repo that scanned clean locally | CI checks out with `fetch-depth: 0` and scans the **full git history**, and this very README quotes the scanners' output — so the fake `sk-live-…` string from the Semgrep demo and the demo bearer token in the `curl` examples were themselves detected. Scanning the write-up of a scan finds the scan | added a fourth, path-scoped `[[allowlists]]` block covering only this README and only the two rules that fire on it (`generic-api-key`, `curl-auth-header`). Verified with a full-history scan: *no leaks found* |

---

## What I Learned

- **A green pipeline and a secure pipeline are different things.** Every single
  security finding in this session came from code I did not write — Express's
  dependency tree and the base image's npm. The application code passed SAST from
  the first run. Most real risk arrives through what you inherit.
- **Scanners must be proved, not trusted.** A rule with a typo finds zero problems
  and looks exactly like a clean codebase. Both the SAST rules and the secret
  rules were run against deliberately bad input to confirm they fire.
- **The honest fix beats the quiet one.** Faced with 10 HIGH findings, adding them
  to `.trivyignore` would have turned the gate green in thirty seconds and left
  every package exactly where it was. Removing npm fixed the actual problem.
- **An allowlist is a decision log.** Every exception carries the reason it was
  granted. The moment exceptions get added without one, the scanner is just
  decoration.
- **Defence in depth means the pipeline is not the only gate.** Pod Security
  Admission rejected a privileged pod that never went near the pipeline, and the
  NetworkPolicy cut off egress at run time — both enforcing after CI had finished.
- **Fail closed.** A missing token makes the app refuse writes; a skipped scan job
  counts as a failed gate. In both cases the safe default is "no".

---

## Conclusion

The pipeline implements the required flow end to end — Code → Build → Unit Test →
SAST → SCA → Secret Scan → Docker Build → Container Image Scan → Security Gate →
Push Image → Deploy — as ten real jobs with four independent scanners feeding one
gate that genuinely blocks publication.

It is not a demonstration that found nothing. The SCA stage caught two HIGH
vulnerabilities in Express, the image scan caught ten more in the base image's npm
CLI, and the secret scanner caught four placeholders across the repository. Each
one was fixed or reviewed and recorded, and only then did the gate turn green.
