import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE = "http://localhost:11434"


class OllamaAgent:
    """
    Wraps Ollama HTTP API for one-shot inference.
    Used by Decomposer (project decomposition) and IntelliRouter.
    Not part of the agent pool — stateless, no PTY.
    """

    def __init__(self, model: str = "qwen3-coder:30b") -> None:
        self.model = model
        self._client = httpx.AsyncClient(base_url=OLLAMA_BASE, timeout=120.0)

    async def run_oneshot(
        self,
        prompt: str,
        temperature: float = 0.2,
        num_ctx: int = 8192,
        timeout: int = 90,
    ) -> str:
        """
        Sends prompt to Ollama, returns the complete response text.
        Low temperature by default — structured output needs determinism.
        Raises httpx.HTTPError on API failure.
        Raises asyncio.TimeoutError if Ollama doesn't respond in time.
        """
        try:
            async with asyncio.timeout(timeout):
                resp = await self._client.post(
                    "/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": temperature,
                            "num_ctx": num_ctx,
                        },
                    },
                )
                resp.raise_for_status()
                return resp.json()["response"]
        except asyncio.TimeoutError:
            logger.error("OllamaAgent timeout after %ds (model: %s)", timeout, self.model)
            raise

    async def health_check(self) -> bool:
        try:
            resp = await self._client.get("/api/tags")
            models = [m["name"] for m in resp.json().get("models", [])]
            return any(self.model.split(":")[0] in m for m in models)
        except Exception:
            return False

    async def close(self) -> None:
        await self._client.aclose()
