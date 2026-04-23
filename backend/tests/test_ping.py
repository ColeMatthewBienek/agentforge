"""
TDD: tests for GET /api/ping — written before the endpoint exists.
All tests MUST FAIL until the endpoint is implemented.
"""
import pytest
from starlette.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from backend.main import app
    # Instantiate without the context manager to bypass the heavy lifespan
    # (DB, embedder, agent pool). We only need FastAPI routing here.
    return TestClient(app, raise_server_exceptions=True)


def test_ping_returns_200(client):
    response = client.get("/api/ping")
    assert response.status_code == 200


def test_ping_body_contains_status_pong(client):
    response = client.get("/api/ping")
    body = response.json()
    assert body.get("status") == "pong"


def test_ping_elapsed_ms_is_non_negative_number(client):
    response = client.get("/api/ping")
    body = response.json()
    elapsed = body.get("elapsed_ms")
    assert isinstance(elapsed, (int, float))
    assert elapsed >= 0
