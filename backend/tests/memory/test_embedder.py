import pytest
import httpx
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from backend.memory.embedder import Embedder


@pytest.fixture
def embedder():
    return Embedder()


@pytest.mark.asyncio
async def test_embed_returns_list_of_floats(embedder):
    fake_vector = [0.1] * 768
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"embedding": fake_vector}

    with patch.object(embedder.client, "post", new=AsyncMock(return_value=mock_response)):
        result = await embedder.embed("hello world")

    assert result == fake_vector
    assert len(result) == 768


@pytest.mark.asyncio
async def test_embed_raises_on_http_error(embedder):
    mock_response = MagicMock()
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "error", request=MagicMock(), response=MagicMock()
    )

    with patch.object(embedder.client, "post", new=AsyncMock(return_value=mock_response)):
        with pytest.raises(httpx.HTTPStatusError):
            await embedder.embed("hello")


@pytest.mark.asyncio
async def test_health_check_true_when_model_available(embedder):
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "models": [{"name": "nomic-embed-text:latest"}]
    }

    with patch.object(embedder.client, "get", new=AsyncMock(return_value=mock_response)):
        result = await embedder.health_check()

    assert result is True


@pytest.mark.asyncio
async def test_health_check_false_when_model_missing(embedder):
    mock_response = MagicMock()
    mock_response.json.return_value = {"models": [{"name": "llama2"}]}

    with patch.object(embedder.client, "get", new=AsyncMock(return_value=mock_response)):
        result = await embedder.health_check()

    assert result is False


@pytest.mark.asyncio
async def test_health_check_false_on_connection_error(embedder):
    with patch.object(embedder.client, "get", new=AsyncMock(side_effect=Exception("refused"))):
        result = await embedder.health_check()

    assert result is False
