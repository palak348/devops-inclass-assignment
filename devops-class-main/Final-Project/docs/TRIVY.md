# Trivy container scan — what it checks, what it found, what was done

## Explanation (M6)

Trivy scans both CareSlot images in the CI pipeline — the backend (`python:3.12-alpine` +
the pinned Python packages) and the frontend (`nginxinc/nginx-unprivileged:1.30-alpine` + the
static React build) — for known vulnerabilities in OS packages and language libraries, and
for secrets baked into image layers. The gate fails the pipeline on **any HIGH or CRITICAL**
finding, before the image is pushed. The current result is **0 vulnerabilities of any
severity and no secrets in either image**, which is the outcome of the hardening below - every
change was made because of a concrete Trivy finding.

## What the scans found and how each finding was removed

| Step | Backend findings | Change made |
|---|---|---|
| Original image `python:3.12-slim` (Debian 13.7) | **44 HIGH** (e.g. **CVE-2026-76642** in `util-linux`, CVE-2026-16742 in `systemd`) - all *without a fixed version* | Switched the base to **`python:3.12-alpine`**: Debian's userland (util-linux, systemd libs, ncurses…) is not in the image at all |
| `python:3.12-alpine` | 0 HIGH/CRITICAL; 6 MEDIUM + 1 LOW: **CVE-2026-85091** (`zlib` 1.3.2-r0, heap buffer overflow, fixed in 1.3.2-r1) and six `pip` CVEs (5 MEDIUM + 1 LOW, e.g. CVE-2026-6357: a malicious wheel can execute code during install) | `apk upgrade` (pulls zlib 1.3.2-r1) |
| Tried upgrading pip to 26.2.1 | pip's own CVEs gone, but **4 new HIGH** in libraries pip *vendors* (`pip/_vendor/urllib3` 2.7.0, `pip/_vendor/msgpack`, ensurepip's `setuptools`) | **Removed pip from the runtime image** (`pip uninstall -y pip`, delete `ensurepip`). The app never installs packages at runtime, so the installer and its vendored libraries are pure attack surface |
| **Final backend image** | **0 findings at every severity** | - |

Frontend: `nginx-unprivileged:1.30-alpine` had 1 MEDIUM, the same zlib **CVE-2026-85091** →
`apk upgrade` in the Dockerfile (as root for that one step, then back to the `nginx` user, uid
101) → **0 findings at every severity**.

**The CVE to explain - CVE-2026-85091 (zlib):** zlib is the compression library almost every
program links against. Versions 1.3.1.2 - 1.3.2 contain a heap buffer overflow: crafted
compressed input can write past an allocated buffer, which can crash the process or corrupt
memory. It was present in **both** base images because they were built before the fix was
released; the fix (1.3.2-r1) already existed in the Alpine repository, so `apk upgrade` during
the build pulls it in. This is why images must be rebuilt and rescanned regularly, not just once.

## How the gate is configured

In `.github/workflows/final-project.yml`, after `docker build` and **before** `docker push`:

```yaml
uses: aquasecurity/trivy-action@v0.36.0
with:
  scan-type: image
  scanners: vuln,secret
  severity: HIGH,CRITICAL
  exit-code: '1'        # any HIGH/CRITICAL finding fails the job -> nothing is pushed
  format: table
```

| Setting | Why |
|---|---|
| Scan before push | A vulnerable image never reaches the registry, so the cluster can never pull it |
| `HIGH,CRITICAL` | Blocks the serious findings; MEDIUM/LOW are reported by local scans and were also fixed |
| `exit-code: 1` | Turns the report into a gate - the job fails instead of just printing a table |
| no `ignore-unfixed` | Even a HIGH with no patch yet fails the build: the only ways forward are a different base image or removing the package, never silently shipping it |
| `scanners: vuln,secret` | Also catches API keys or passwords accidentally copied into an image layer |

## Reproduce locally

```bash
docker compose build
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest \
  image --scanners vuln,secret --severity HIGH,CRITICAL --exit-code 1 careslot-backend:local
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest \
  image --scanners vuln,secret --severity HIGH,CRITICAL --exit-code 1 careslot-frontend:local
# drop --severity to see MEDIUM/LOW too: both images report none (2026-10-16)
```

### CI result (authoritative)

Run [38861267530](https://github.com/palak348/devops-inclass-assignment/actions/runs/38861267530)
(commit `b6fbcd2`, strict gate - no `ignore-unfixed`), Trivy 0.70.0 via `trivy-action@v0.36.0`:

| Image | OS detected | Packages | Vulnerabilities |
|---|---|---|---|
| `careslot-backend:b6fbcd2…` | Alpine 3.24.2 | 38 OS packages + Python site-packages | **0** |
| `careslot-frontend:b6fbcd2…` | Alpine 3.24.2 | 70 OS packages | **0** |

Screenshots: `docs/screenshots/m6-trivy-backend.png`, `docs/screenshots/m6-trivy-frontend.png`.
The CVE database changes daily, so a later run can report something new - which is exactly
why the scan runs on every build and blocks the push.

## Where this sits among other security controls

| Layer | In this project |
|---|---|
| SAST (code) | `ruff` with bugbear rules in CI |
| Dependency scanning | Trivy covers the Python packages inside the image; `npm audit` reports 0 issues for the frontend |
| Secret scanning | Trivy `secret` scanner on images; **gitleaks over the whole git history** (repo-root `.gitleaks.toml`, see the project README); `.env`, `*.tfvars` git-ignored; passwords generated in-cluster |
| Container scanning | Trivy gate above |
| Runtime hardening | non-root users (10001 / 101 / 70), `capabilities: drop ALL`, no privilege escalation, read-only root FS (backend), no package installer in the backend image, namespace Pod Security `restricted` |
