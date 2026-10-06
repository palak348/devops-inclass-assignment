# Session 16 — CI/CD & GitHub Actions

## Student Information

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

---

## Objective

The objective of this practical was to build a complete **CI/CD demo project using GitHub
Actions** — an application with tests, a Dockerfile, a CI pipeline that lints, tests and
builds, and a CD pipeline that publishes the image and deploys it — covering CI vs CD,
workflows, jobs, steps, runners, secrets, artifacts and pipeline execution.

---

## Deliverables

| Deliverable | Location |
|---|---|
| Application source code | `app/src/`, `app/tests/` |
| Dockerfile | `app/Dockerfile` |
| GitHub Actions workflow | `.github/workflows/` **at the repository root** |
| CI pipeline | `.github/workflows/ci.yml` |
| CD pipeline | `.github/workflows/cd.yml` |
| Kubernetes manifests | `k8s/` |
| Screenshots | `images/` |
| README.md | this file |

> **Why the workflows are not in this folder:** GitHub Actions only discovers workflow
> files in `.github/workflows/` at the **root of the repository**. A workflow placed inside
> a subdirectory is never executed. The workflows therefore live at the repo root and
> reference this folder through the `APP_DIR` environment variable.

---

## Folder Structure

```
devops-inclass-assignment/                  <- repository root
├── .github/
│   └── workflows/
│       ├── ci.yml                          <- CI pipeline
│       └── cd.yml                          <- CD pipeline
└── devops-class-main/
    └── CI-CD & GitHub Actions/
        ├── app/
        │   ├── src/
        │   │   ├── server.js               # HTTP layer
        │   │   └── calculator.js           # business logic
        │   ├── tests/
        │   │   └── calculator.test.js      # 5 unit tests
        │   ├── package.json
        │   ├── Dockerfile                  # multi-stage
        │   └── .dockerignore
        ├── k8s/
        │   ├── namespace.yaml
        │   └── deployment.yaml
        ├── images/
        └── readme.md
```

---

## CI vs CD

| | **CI — Continuous Integration** | **CD — Continuous Delivery/Deployment** |
|---|---|---|
| **Question answered** | "Is this change safe to merge?" | "Can this change reach users?" |
| **Trigger** | Every push and pull request | Only after CI passes on `main` |
| **Typical steps** | Lint → test → build | Publish image → deploy → verify |
| **Touches production** | **No** | **Yes** |
| **Fails when** | Code is broken | Deployment is broken |
| **Feedback speed** | Seconds to minutes | Minutes |

**Continuous Delivery** means every change is *ready* to release, with a human approving the
final step. **Continuous Deployment** removes that approval and ships automatically. This
project implements Delivery — the `deploy` job targets a GitHub `environment`, which can be
configured to require manual approval.

The key design rule: **CI must never deploy, and CD must never run on unverified code.**
That is enforced here by `cd.yml` triggering on `workflow_run` of the CI pipeline, with an
`if:` gate checking `conclusion == 'success'`.

---

## GitHub Actions concepts

```
WORKFLOW  (.github/workflows/ci.yml)        <- one YAML file, one pipeline
   │
   ├── triggered by an EVENT (push, pull_request, workflow_dispatch, workflow_run)
   │
   ├── JOB: lint          ─┐
   ├── JOB: test          ─┤ run in PARALLEL (no dependency between them)
   │                       │
   ├── JOB: build          │ needs: [lint, test]   <- waits for both
   │     │                 │
   │     ├── STEP: checkout
   │     ├── STEP: setup buildx
   │     └── STEP: docker build
   │
   └── JOB: ci-summary       needs: [lint, test, build]

Each JOB runs on its own RUNNER - a fresh, isolated ubuntu-latest VM.
```

| Concept | What it is | In this project |
|---|---|---|
| **Workflow** | One automated process, defined in a YAML file | `ci.yml`, `cd.yml` |
| **Event** | What triggers a workflow | `push`, `pull_request`, `workflow_dispatch`, `workflow_run` |
| **Job** | A group of steps on one runner | `lint`, `test`, `build`, `ci-summary`, `publish`, `deploy` |
| **Step** | A single task — a shell command or an action | `npm test`, `actions/checkout@v4` |
| **Runner** | The machine executing a job | `ubuntu-latest` (GitHub-hosted) |
| **Action** | A reusable packaged step | `actions/checkout`, `docker/build-push-action` |
| **Secret** | Encrypted value injected at runtime | `${{ secrets.GITHUB_TOKEN }}` |
| **Artifact** | A file produced by a run, downloadable afterwards | `test-results`, `docker-image` |

**Jobs are isolated.** Each gets a clean VM, so a file written in `lint` does not exist in
`build`. Passing data between jobs requires either an artifact or a job `output` — both are
demonstrated here.

---

## Application

A small Node.js service with **no runtime dependencies** (standard library only), so the
build is fast and reproducible and there is no `npm install` step to break.

**`src/calculator.js`** — pure business logic, deliberately separated from HTTP so it can be
unit tested without starting a server:

```javascript
function divide(a, b) {
  if (b === 0) {
    throw new Error('Division by zero is not allowed');
  }
  return a / b;
}
```

**`src/server.js`** — exposes three endpoints:

| Endpoint | Purpose |
|---|---|
| `/` | HTML page showing version, environment and pod hostname |
| `/health` | JSON health check, used by Docker HEALTHCHECK and Kubernetes probes |
| `/api/calculate?a=&b=&op=` | The calculator API |

**`tests/calculator.test.js`** — 5 unit tests using Node's built-in test runner:

```bash
npm test
```

```
ok 1 - calculator
# tests 5
# suites 1
# pass 5
# fail 0
# duration_ms 236.9854
```

> **Issue hit:** the test script was originally `node --test tests/`, which fails on Node 22
> with `Cannot find module '...\tests'` — the directory is resolved as a module path.
> Changed to plain `node --test`, which auto-discovers `*.test.js`.

---

## Dockerfile

A **multi-stage** build: the first stage installs dependencies and runs the tests, the
second copies only what is needed to run.

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm install --omit=dev
COPY src/ ./src/
COPY tests/ ./tests/
RUN node --test                      # image build FAILS if tests fail

FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder --chown=app:app /build/src ./src
COPY --from=builder --chown=app:app /build/package.json ./
USER app                             # non-root
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "src/server.js"]
```

Three deliberate choices:

1. **`RUN node --test` in the builder stage** — the image cannot be built from code that
   fails its tests. A second safety net behind CI.
2. **Non-root `USER app`** — a container escape does not land on root.
3. **`HEALTHCHECK`** — Docker itself reports the container as healthy or unhealthy.

### Local build and run

```bash
docker build -t cicd-demo:local .
docker run -d -p 3099:3000 cicd-demo:local
curl http://localhost:3099/health
curl 'http://localhost:3099/api/calculate?a=6&b=7&op=multiply'
```

```
{"status":"healthy","version":"1.0.0"}
{"a":6,"b":7,"op":"multiply","result":42}
```

```bash
docker ps --filter name=cicd-test
docker images cicd-demo
```

```
NAMES       STATUS                   PORTS
cicd-test   Up 9 seconds (healthy)   0.0.0.0:3099->3000/tcp

REPOSITORY   TAG       SIZE
cicd-demo    local     238MB
```

`Up 9 seconds (healthy)` — the HEALTHCHECK passed.

---

## CI Pipeline — `.github/workflows/ci.yml`

### Triggers

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'devops-class-main/CI-CD & GitHub Actions/app/**'
      - '.github/workflows/ci.yml'
  pull_request:
    branches: [main]
  workflow_dispatch:
```

The `paths` filter means the pipeline only runs when the **app** changes — editing a README
in another session folder does not burn CI minutes. `workflow_dispatch` adds a manual
"Run workflow" button in the Actions tab.

### Job 1 — Lint

```yaml
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      - name: Run syntax check
        working-directory: ${{ env.APP_DIR }}
        run: npm run lint
```

Cheapest check first, so a typo fails in ~15 seconds instead of after a 2-minute build.

### Job 2 — Test (runs in parallel with Lint)

```yaml
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm test
      - name: Upload test results artifact
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: ${{ env.APP_DIR }}/test-results.tap
          retention-days: 7
```

`test` has no `needs:`, so it starts at the same time as `lint` — both finish in the time
the slower one takes.

### Job 3 — Build (depends on both)

```yaml
  build:
    needs: [lint, test]
    steps:
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: ${{ env.APP_DIR }}
          push: false                       # CI verifies the build; it does not publish
          outputs: type=docker,dest=/tmp/cicd-demo-image.tar
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

`needs: [lint, test]` is what turns a set of jobs into a **pipeline**. `push: false` is the
CI/CD boundary — CI proves the image builds, CD publishes it. `cache-from/to: type=gha`
reuses Docker layers between runs.

### Job 4 — Summary

Demonstrates reading other jobs' results and writing to the run summary page:

```yaml
  ci-summary:
    needs: [lint, test, build]
    if: always()
    steps:
      - run: |
          echo "| Lint | ${{ needs.lint.result }} |" >> $GITHUB_STEP_SUMMARY
```

`if: always()` makes it run even when an earlier job failed, so the summary still reports
what happened.

---

## CD Pipeline — `.github/workflows/cd.yml`

### Chaining off CI

```yaml
on:
  workflow_run:
    workflows: ["CI Pipeline"]
    types: [completed]
    branches: [main]
```

```yaml
    if: >
      github.event_name == 'workflow_dispatch' ||
      github.event.workflow_run.conclusion == 'success'
```

`workflow_run` fires when CI **completes**, including on failure — so the `if:` gate is
essential. Without it, the CD pipeline would happily deploy a commit whose tests failed.

### Permissions and secrets

```yaml
    permissions:
      contents: read
      packages: write

    steps:
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
```

**`GITHUB_TOKEN` is created automatically for every run** — no secret had to be added to
make this work. `permissions:` narrows it to the minimum: read the code, write packages.

A custom secret would be used identically:

```yaml
          password: ${{ secrets.DOCKERHUB_TOKEN }}
```

after adding it under **Settings → Secrets and variables → Actions**. Secrets are encrypted
at rest, masked in logs, and **not** passed to workflows triggered by pull requests from
forks.

### Job outputs

```yaml
    outputs:
      image-tag: ${{ steps.meta.outputs.tag }}

      - name: Compute image tag
        id: meta
        run: |
          TAG=$(echo "${{ github.sha }}" | cut -c1-7)
          echo "tag=$TAG" >> $GITHUB_OUTPUT
```

Consumed by the next job as `${{ needs.publish.outputs.image-tag }}`. Tagging by commit SHA
rather than `latest` makes every deployment traceable to an exact commit.

### Deploy job

```yaml
  deploy:
    needs: publish
    environment: production        # can require manual approval
    steps:
      - name: Update manifest with the new image tag
        run: sed -i "s|image: ghcr.io/.*cicd-demo:.*|image: $IMAGE|" "$MANIFEST"
      - name: Validate manifests
        run: ./kubeconform -summary -strict "devops-class-main/CI-CD & GitHub Actions/k8s/"
```

### Issue hit during the first pipeline run

The validate step originally used `kubectl apply --dry-run=client` and **failed**:

```
The connection to the server localhost:8080 was refused - did you specify the right host or port?
```

*Root cause:* despite its name, `kubectl apply --dry-run=client` still contacts the API
server for **resource discovery** before it can validate. A GitHub-hosted runner has no
cluster and no kubeconfig, so the call fails.

*Fix:* replaced it with **kubeconform**, which validates manifests against the Kubernetes
JSON schemas completely offline — the correct tool for manifest linting in CI.

> **Limitation:** the target cluster is a local Minikube with no public endpoint, so a
> GitHub-hosted runner cannot reach it. The pipeline therefore renders the manifest with the
> new image tag and validates it offline; the actual apply is shown below, run locally.
> Deploying to a real cluster would add a kubeconfig secret:
>
> ```yaml
> - uses: azure/k8s-set-context@v4
>   with:
>     kubeconfig: ${{ secrets.KUBE_CONFIG }}
> - run: kubectl apply -f k8s/
> ```

---

## Deployment to Kubernetes

The locally built image was loaded into Minikube and the manifests applied:

```bash
minikube image load cicd-demo:local
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
```

```
namespace/session16 created
deployment.apps/cicd-demo created
service/cicd-demo-svc created
```

```bash
kubectl get all -n session16
```

```
NAME                            READY   STATUS    RESTARTS   AGE
pod/cicd-demo-f88c8bfcd-s24k2   1/1     Running   0          13s
pod/cicd-demo-f88c8bfcd-xlfht   1/1     Running   0          13s

NAME                    TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
service/cicd-demo-svc   NodePort   10.101.33.234   <none>        80:30161/TCP   13s

NAME                        READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/cicd-demo   2/2     2            2           13s
```

Both Pods passed their readiness probes (`1/1`), which means the `/health` endpoint is
responding. Verifying through the Service:

```bash
curl http://localhost:30161/health
curl 'http://localhost:30161/api/calculate?a=6&b=7&op=multiply'
curl http://localhost:30161/
```

```
{"status":"healthy","version":"1.0.0"}

{"a":6,"b":7,"op":"multiply","result":42}

<h1>CI/CD Demo App</h1>
<p>version: 1.0.0</p>
<p>environment: production</p>
<p>hostname: cicd-demo-f88c8bfcd-xlfht</p>
```

The `hostname` line shows which Pod served the request — proof the Service is load
balancing across both replicas.

---

## Pipeline execution

Pushing to `main` triggers the CI pipeline, and its success triggers the CD pipeline.

```
push to main
     │
     ▼
CI Pipeline
  ├── Lint ──────┐
  ├── Test ──────┤ parallel
  │              │
  ├── Build ◄────┘ needs: [lint, test]
  │     └── artifacts: test-results, docker-image
  └── CI Summary
     │
     │ workflow_run: completed + conclusion == success
     ▼
CD Pipeline
  ├── Publish ──> ghcr.io/palak348/cicd-demo:<sha>
  └── Deploy ───> render manifest + validate
```

Runs are visible under the repository's **Actions** tab. Artifacts are downloadable from
each run's summary page.

### Screenshots

![ci pipeline](images/01-ci-pipeline.png)

![cd pipeline](images/02-cd-pipeline.png)

![deployment](images/03-deployment.png)

---

## Cleanup

```bash
kubectl delete namespace session16
docker rmi cicd-demo:local
```

---

## Conclusion

A complete CI/CD project was built and executed. The CI pipeline runs `lint` and `test` in
parallel, then `build` behind `needs: [lint, test]`, producing two downloadable artifacts
and a rendered summary table. The CD pipeline chains off it with `workflow_run` plus an
`if: conclusion == 'success'` gate, which is what guarantees the deployment path can never
run on a commit that failed its tests.

The CI/CD boundary shows up concretely in one line of YAML: CI's build job sets
`push: false`, so it proves the image *can* be built without publishing anything, while CD
authenticates with the automatically provided `GITHUB_TOKEN` and pushes to GHCR tagged by
commit SHA. Nothing had to be configured manually for that authentication to work — the
`permissions: packages: write` block was the only requirement.

The application, Dockerfile and manifests were all verified end to end: 5 unit tests
passing, a multi-stage image that runs its own tests during build and reports
`Up 9 seconds (healthy)`, and a two-replica Kubernetes Deployment whose readiness probes
pass and whose Service load balances between Pods.
