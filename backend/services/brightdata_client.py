from __future__ import annotations

import json
import os
from typing import List
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class BrightDataClient:
    def __init__(self) -> None:
        self.api_key = os.getenv("BRIGHTDATA_API_KEY", "")
        self.endpoint = os.getenv("BRIGHTDATA_API_ENDPOINT", "")
        self.timeout = float(os.getenv("BRIGHTDATA_TIMEOUT", "30"))

    def is_configured(self) -> bool:
        return bool(self.api_key and self.endpoint)

    def fetch_market_context(self, query: str) -> List[str]:
        if not self.is_configured():
            return []

        payload = {"query": query, "limit": 3}
        request = Request(
            url=self.endpoint,
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
            return []

        snippets = self._extract_snippets(body)
        return snippets[:3]

    def _extract_snippets(self, payload) -> List[str]:
        snippets: List[str] = []

        if isinstance(payload, dict):
            iterable = payload.get("results") or payload.get("data") or payload.get("items") or [payload]
        elif isinstance(payload, list):
            iterable = payload
        else:
            iterable = []

        for item in iterable:
            if not isinstance(item, dict):
                continue
            parts = [
                str(item.get("title", "")).strip(),
                str(item.get("snippet", "")).strip(),
                str(item.get("description", "")).strip(),
                str(item.get("content", "")).strip(),
                str(item.get("body", "")).strip(),
            ]
            text = " ".join(part for part in parts if part)
            if text:
                snippets.append(text)

        return snippets
