from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .routers import appointments, doctors, patients, stats

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="CareSlot - clinic appointment booking API (doctors, patients, appointments).",
)

# The browser normally reaches the API through Nginx / the Ingress on the same
# origin; CORS only matters when the Vite dev server runs on another port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exposes Prometheus metrics (request count, latency histogram, sizes) on /metrics.
Instrumentator(excluded_handlers=["/metrics", "/health", "/ready"]).instrument(app).expose(
    app, endpoint="/metrics", include_in_schema=False
)

app.include_router(doctors.router)
app.include_router(patients.router)
app.include_router(appointments.router)
app.include_router(stats.router)


@app.get("/", tags=["meta"])
def root():
    return {"service": settings.app_name, "version": settings.app_version, "docs": "/docs"}


@app.get("/health", tags=["meta"])
def health():
    """Liveness: the process is up and serving HTTP. Deliberately does not touch the DB."""
    return {"status": "UP"}


@app.get("/ready", tags=["meta"])
def ready(db: Session = Depends(get_db)):
    """Readiness: only report READY when the database answers."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - any DB failure means "not ready"
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"status": "READY"}
