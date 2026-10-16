# CareSlot backend (FastAPI)

REST API for doctors, patients and appointments, with PostgreSQL via SQLAlchemy and
Alembic migrations. Exposes `/health` (liveness), `/ready` (database check), `/metrics`
(Prometheus) and Swagger at `/docs`.

```text
backend/
├── app/
│   ├── main.py            FastAPI app, CORS, Prometheus instrumentator, /, /health, /ready
│   ├── config.py          settings from environment variables
│   ├── db.py              engine, session, get_db dependency
│   ├── models.py          Doctor, Patient, Appointment (SQLAlchemy 2)
│   ├── schemas.py         Pydantic request/response models and validation rules
│   ├── clock.py           UTC storage, clinic-local "day" (Asia/Kolkata by default)
│   └── routers/           doctors.py · patients.py · appointments.py (booking rules) · stats.py
├── alembic/versions/      0001_initial_schema.py · 0002_seed_doctors.py
├── tests/                 45 pytest tests, fresh in-memory SQLite DB per test (conftest.py)
├── Dockerfile             python:3.12-alpine, non-root uid 10001, no pip in the final image
├── requirements.txt       runtime dependencies (pinned)
└── requirements-dev.txt   + pytest, httpx2, ruff
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./careslot-dev.db` | SQLAlchemy URL, e.g. `postgresql+psycopg://careslot:<password>@localhost:5432/careslot` |
| `CLINIC_TIMEZONE` | `Asia/Kolkata` | Local day used for "today" and the `on_date` filter |

## Run, test, lint

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt        # Windows paths; Linux/macOS: .venv/bin/...
.venv\Scripts\python -m pytest -v                        # 45 tests, no database needed
.venv\Scripts\python -m ruff check . ; .venv\Scripts\python -m ruff format --check .

# against a real PostgreSQL
$env:DATABASE_URL = "postgresql+psycopg://careslot:<password>@localhost:5432/careslot"   # PowerShell
.venv\Scripts\alembic upgrade head
.venv\Scripts\uvicorn app.main:app --reload --port 8000  # http://localhost:8000/docs
```

## Booking rules (enforced here, covered by tests)

`404` unknown id · `400` booking in the past or with an unavailable doctor · `409` overlap for
the doctor **or** the patient, or an invalid status move (`SCHEDULED → CHECKED_IN → COMPLETED`,
or `→ CANCELLED`; finished visits are read-only) · `422` invalid input (10-digit phone, blank
names, future date of birth, unknown fields).
