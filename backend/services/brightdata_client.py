from __future__ import annotations

import json
import os
from typing import List
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.config.env import load_local_env


class BrightDataClient:
    def __init__(self) -> None:
        load_local_env()
        self.api_key = os.getenv("BRIGHTDATA_API_KEY", "")
        self.endpoint = os.getenv("BRIGHTDATA_API_ENDPOINT", "https://api.brightdata.com/request")
        self.zone = os.getenv("BRIGHTDATA_ZONE", "")
        self.country = os.getenv("BRIGHTDATA_COUNTRY", "us")
        self.timeout = float(os.getenv("BRIGHTDATA_TIMEOUT", "30"))

    def is_configured(self) -> bool:
        return bool(self.api_key and self.endpoint and self.zone)

    def fetch_market_context(self, query: str) -> List[str]:
        if not self.is_configured():
            return []

        payload = {
            "zone": self.zone,
            "url": f"https://www.google.com/search?q={query.replace(' ', '+')}&gl={self.country}",
            "format": "raw",
        }
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
                raw_body = response.read().decode("utf-8", errors="ignore")
        except (HTTPError, URLError, TimeoutError):
            return []

        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError:
            body = {"content": raw_body}

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
