import logging
import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
EMBEDDING_DIMENSIONS = 768


class Embedder:
    def __init__(self):
        self.client = httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=30.0)

    async def embed(self, text: str) -> list[float]:
        response = await self.client.post("/api/embeddings", json={
            "model": EMBED_MODEL,
            "prompt": text,
        })
        response.raise_for_status()
        return response.json()["embedding"]

    async def health_check(self) -> bool:
        try:
            response = await self.client.get("/api/tags")
            models = [m["name"] for m in response.json().get("models", [])]
            return any("nomic-embed-text" in m for m in models)
        except Exception:
            return False

    async def shutdown(self):
        await self.client.aclose()
