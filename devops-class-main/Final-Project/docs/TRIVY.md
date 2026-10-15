# Trivy container scan — what it checked and what the result means

## Explanation (M6)

Trivy scanned both CareSlot images — the backend (`python:3.12-slim`, Debian 13.7 + the
pinned Python packages) and the frontend (`nginx-unprivileged:1.30-alpine`, Alpine 3.24 +
the static React build) — for known vulnerabilities in OS packages and language
libraries, and for secrets baked into image layers. The result was **0 fixable HIGH or
CRITICAL vulnerabilities and no secrets in either image**, so the gate passed and the
images were allowed into GHCR. The backend's Debian base still carries 44 HIGH CVEs that
Debian has **not published a fix for yet** (e.g. CVE-2026-76642 in util-linux, CVE-2026-16742
in systemd); none can be removed by upgrading, they concern tools the API never calls, and
they will fail the build automatically the day a patched package exists.

## How the gate is configured

In `.github/workflows/final-project.yml`, after `docker build` and **before** `docker push`:

```yaml
uses: aquasecurity/trivy-action@v0.36.0
with:
  scan-type: image
  scanners: vuln,secret
  severity: HIGH,CRITICAL
  ignore-unfixed: true
  exit-code: '1'        # any finding fails the job -> nothing is pushed
```

| Setting | Why |
|---|---|
| Scan before push | A vulnerable image never reaches the registry, so the cluster can never pull it |
| `HIGH,CRITICAL` | Blocks the serious findings without drowning the pipeline in LOW/MEDIUM noise |
| `exit-code: 1` | Turns the report into a gate — the job fails instead of just printing a table |
| `ignore-unfixed` | A CVE without a patched package can't be fixed by us; blocking on it would keep the pipeline red forever. As soon as a fix is released, the CVE counts and the build fails until the base image is rebuilt |
| `scanners: vuln,secret` | Also catches API keys or passwords accidentally copied into an image layer |

## Reproduce locally

```bash
docker compose build
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest \
  image --scanners vuln,secret --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 careslot-backend:local
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest \
  image --scanners vuln,secret --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 careslot-frontend:local
```

Local run (2026-10-15): backend `exit=0`, frontend `exit=0` (Alpine 3.24.2: 0 vulnerabilities).
Without `--ignore-unfixed` the backend reports `Total: 44 (HIGH: 44, CRITICAL: 0)`, all
with no fixed version.

> The CVE database changes daily, so the CI run on the day of submission is the
> authoritative result — its screenshot goes in `docs/screenshots/m6-trivy.png`.

## Where this sits among other security controls

| Layer | In this project |
|---|---|
| SAST (code) | `ruff` with bugbear rules in CI |
| Dependency scanning | Trivy covers Python packages in the image; `npm audit` reports 0 issues for the frontend |
| Secret scanning | Trivy `secret` scanner; `.env`, `*.tfvars` git-ignored; passwords generated in-cluster |
| Container scanning | Trivy gate above |
| Runtime hardening | non-root users, `capabilities: drop ALL`, no privilege escalation, read-only root FS (backend), namespace Pod Security `restricted` |
