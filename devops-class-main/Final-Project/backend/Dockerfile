# Alpine base: Trivy reports 0 HIGH/CRITICAL CVEs for it, including unfixed ones
# (python:3.12-slim / Debian carried 44 unfixed HIGH), so the CI gate can fail on
# every HIGH/CRITICAL finding without an "ignore unfixed" exception.
FROM python:3.12-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so this layer is cached until requirements.txt changes.
# --only-binary: use the prebuilt musl wheels; never compile (no build tools in
# the image), so a missing wheel fails the build loudly instead of silently.
# Hardening, each step driven by a Trivy finding:
#  - apk upgrade: OS fixes released after the base image (e.g. zlib CVE-2026-85091)
#  - pip is only needed to install; it (and the copies of urllib3/msgpack/setuptools
#    it vendors, plus ensurepip's bundled wheels) is removed afterwards, so the
#    runtime image ships no package installer and none of its CVEs.
COPY requirements.txt .
RUN apk upgrade --no-cache \
    && pip install --only-binary=:all: -r requirements.txt \
    && pip uninstall -y pip \
    && rm -rf /usr/local/lib/python3.12/ensurepip \
    && adduser -D -u 10001 -h /home/appuser -s /sbin/nologin appuser

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# Never run the application as root.
USER 10001

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"

# Apply pending migrations, then start the API. exec makes uvicorn PID 1 so it
# receives SIGTERM from Docker / Kubernetes and shuts down gracefully.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
