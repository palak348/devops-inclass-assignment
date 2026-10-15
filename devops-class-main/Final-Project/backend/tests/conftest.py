"""Test fixtures.

Every test gets a brand-new in-memory SQLite database, wired into the app by
overriding the `get_db` dependency. The tests therefore never touch the
PostgreSQL database used by docker compose or Kubernetes.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture()
def db_session() -> Iterator[Session]:
    # StaticPool keeps the single in-memory connection alive for the whole test.
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def doctor(client: TestClient) -> dict:
    response = client.post(
        "/api/doctors", json={"name": "Dr. Test Doctor", "specialty": "General Medicine", "room": "101"}
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture()
def patient(client: TestClient) -> dict:
    response = client.post(
        "/api/patients",
        json={"name": "Asha Verma", "phone": "+91 98765 43210", "email": "asha@example.com"},
    )
    assert response.status_code == 201
    return response.json()
