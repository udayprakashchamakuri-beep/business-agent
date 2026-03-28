from __future__ import annotations

import json
import os
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.config.env import load_local_env


class FeatherlessClient:
    def __init__(self) -> None:
        load_local_env()
        self.api_key = os.getenv("FEATHERLESS_API_KEY", "")
        self.model = os.getenv("FEATHERLESS_MODEL", "")
        self.base_url = os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1").rstrip("/")
        self.timeout = float(os.getenv("FEATHERLESS_TIMEOUT", "4"))

    def is_configured(self) -> bool:
        return bool(self.api_key and self.model)

    def generate_boardroom_message(self, system_prompt: str, prompt: str, fallback: str) -> str:
        if not self.is_configured():
            return fallback

        return self._chat_completion(
            system_prompt=system_prompt,
            prompt=prompt,
            fallback=fallback,
            temperature=0.25,
            max_tokens=260,
        )

    def classify_prompt_kind(self, prompt: str) -> Optional[str]:
        if not self.is_configured():
            return None

        content = self._chat_completion(
            system_prompt=(
                "You classify whether a user prompt is asking for business advice or not. "
                "Reply with exactly one word: BUSINESS or GENERAL."
            ),
            prompt=(
                "Classify this prompt.\n"
                "BUSINESS = business decision, startup, pricing, launch, market, revenue, hiring, growth, costs, risk, or operations.\n"
                "GENERAL = biography, trivia, school knowledge, history, definitions, or anything not asking for business advice.\n\n"
                f"Prompt: {prompt}"
            ),
            fallback="",
            temperature=0,
            max_tokens=4,
        ).strip().upper()
        if content in {"BUSINESS", "GENERAL"}:
            return content
        return None

    def answer_general_prompt(self, prompt: str, fallback: str) -> str:
        if not self.is_configured():
            return fallback

        return self._chat_completion(
            system_prompt=(
                "You are a helpful general assistant. Answer clearly in normal human language. "
                "Keep the answer concise but useful. Do not turn it into business advice unless the user asks for that."
            ),
            prompt=prompt,
            fallback=fallback,
            temperature=0.3,
            max_tokens=260,
        )

    def _chat_completion(
        self,
        system_prompt: str,
        prompt: str,
        fallback: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        payload = {
            "model": self.model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        }
        request = Request(
            url=f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=self.timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
            return fallback

        content = self._extract_content(body)
        return content.strip() if content else fallback

    def _extract_content(self, payload: dict) -> Optional[str]:
        choices = payload.get("choices", [])
        if not choices:
            return None
        message = choices[0].get("message", {})
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    parts.append(item.get("text", ""))
            return "".join(parts)
        return None
