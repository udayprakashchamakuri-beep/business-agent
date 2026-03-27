from __future__ import annotations

import concurrent.futures
import json
import os
import re
from dataclasses import dataclass, field
from html import unescape
from typing import Dict, Iterable, List, Sequence, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from backend.config.env import load_local_env


@dataclass
class BrightDataHit:
    topic: str
    query: str
    title: str
    snippet: str
    url: str = ""
    rank: int = 0

    def summary(self) -> str:
        parts = [self.title.strip(), self.snippet.strip()]
        clean_parts = [part for part in parts if part]
        return " - ".join(clean_parts[:2])


@dataclass
class BrightDataResearch:
    hits_by_topic: Dict[str, List[BrightDataHit]] = field(default_factory=dict)

    def add_hits(self, topic: str, hits: Sequence[BrightDataHit]) -> None:
        if not hits:
            return
        bucket = self.hits_by_topic.setdefault(topic, [])
        bucket.extend(hits)

    def get(self, topic: str) -> List[BrightDataHit]:
        return list(self.hits_by_topic.get(topic, []))

    def topics(self) -> List[str]:
        return list(self.hits_by_topic.keys())

    def all_hits(self) -> List[BrightDataHit]:
        combined: List[BrightDataHit] = []
        for hits in self.hits_by_topic.values():
            combined.extend(hits)
        return combined

    def summaries(self, topic: str | None = None, limit: int = 3) -> List[str]:
        hits = self.get(topic) if topic else self.all_hits()
        return [hit.summary() for hit in hits[:limit] if hit.summary()]

    def keyword_text(self) -> str:
        return " ".join(f"{hit.title} {hit.snippet}" for hit in self.all_hits()).lower()

    def has_hits(self) -> bool:
        return any(self.hits_by_topic.values())


class BrightDataClient:
    def __init__(self) -> None:
        load_local_env()
        self.api_key = os.getenv("BRIGHTDATA_API_KEY", "")
        self.endpoint = os.getenv("BRIGHTDATA_API_ENDPOINT", "https://api.brightdata.com/request")
        self.zone = os.getenv("BRIGHTDATA_ZONE", "")
        self.country = os.getenv("BRIGHTDATA_COUNTRY", "us")
        self.timeout = float(os.getenv("BRIGHTDATA_TIMEOUT", "4"))
        self.response_format = os.getenv("BRIGHTDATA_RESPONSE_FORMAT", "json").strip() or "json"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.endpoint and self.zone)

    def fetch_market_context(self, query: str) -> List[str]:
        research = self.fetch_market_research([("general", query)])
        return research.summaries(topic="general", limit=3)

    def fetch_market_research(self, query_specs: Sequence[Tuple[str, str]]) -> BrightDataResearch:
        if not self.is_configured():
            return BrightDataResearch()

        normalized_specs = self._normalize_specs(query_specs)
        if not normalized_specs:
            return BrightDataResearch()

        research = BrightDataResearch()
        worker_count = min(4, len(normalized_specs))
        with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as executor:
            future_map = {
                executor.submit(self._run_query, topic, query): (topic, query)
                for topic, query in normalized_specs
            }
            for future in concurrent.futures.as_completed(future_map):
                topic, _query = future_map[future]
                try:
                    hits = future.result()
                except Exception:
                    hits = []
                research.add_hits(topic, hits)

        return research

    def _normalize_specs(self, query_specs: Sequence[Tuple[str, str]]) -> List[Tuple[str, str]]:
        deduped: List[Tuple[str, str]] = []
        seen: set[Tuple[str, str]] = set()
        for topic, query in query_specs:
            clean_topic = str(topic or "general").strip().lower()
            clean_query = str(query or "").strip()
            if not clean_query:
                continue
            key = (clean_topic, clean_query.lower())
            if key in seen:
                continue
            seen.add(key)
            deduped.append((clean_topic, clean_query))
        return deduped

    def _run_query(self, topic: str, query: str) -> List[BrightDataHit]:
        payload = {
            "zone": self.zone,
            "url": f"https://www.google.com/search?q={quote_plus(query)}&gl={self.country}&hl=en",
        }
        if self.response_format:
            payload["format"] = self.response_format
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

        body = self._normalize_payload(body)
        hits = self._extract_hits(body, topic=topic, query=query)
        return hits[:3]

    def _extract_hits(self, payload, topic: str, query: str) -> List[BrightDataHit]:
        hits: List[BrightDataHit] = []
        seen: set[Tuple[str, str]] = set()

        for rank, item in enumerate(self._walk_payload(payload), start=1):
            title = self._clean_text(
                item.get("title")
                or item.get("name")
                or item.get("headline")
                or item.get("question")
                or item.get("result_title")
                or item.get("link_text")
            )
            snippet = self._clean_text(
                item.get("snippet")
                or item.get("description")
                or item.get("body")
                or item.get("text")
                or item.get("content")
                or item.get("answer")
                or item.get("result_description")
            )
            url = self._clean_text(item.get("url") or item.get("link") or item.get("displayed_link") or item.get("href"))
            if not title and not snippet:
                continue

            signature = (title.lower(), snippet.lower())
            if signature in seen:
                continue
            seen.add(signature)
            hits.append(
                BrightDataHit(
                    topic=topic,
                    query=query,
                    title=title,
                    snippet=snippet,
                    url=url,
                    rank=rank,
                )
            )

        if hits:
            return hits

        if isinstance(payload, dict):
            raw_content = payload.get("content")
            if isinstance(raw_content, str):
                return self._extract_hits_from_html(raw_content, topic=topic, query=query)

        return []

    def _walk_payload(self, payload) -> Iterable[dict]:
        stack = [payload]
        seen_ids: set[int] = set()

        while stack:
            current = stack.pop()
            if not isinstance(current, (dict, list)):
                continue
            identifier = id(current)
            if identifier in seen_ids:
                continue
            seen_ids.add(identifier)

            if isinstance(current, dict):
                if self._looks_like_result(current):
                    yield current
                for value in current.values():
                    if isinstance(value, (dict, list)):
                        stack.append(value)
            else:
                for value in current:
                    if isinstance(value, (dict, list)):
                        stack.append(value)

    def _looks_like_result(self, item: dict) -> bool:
        candidate_keys = {
            "title",
            "name",
            "headline",
            "question",
            "snippet",
            "description",
            "body",
            "text",
            "content",
            "answer",
            "url",
            "link",
            "href",
        }
        return any(key in item for key in candidate_keys)

    def _normalize_payload(self, payload):
        if not isinstance(payload, dict):
            return payload

        nested_body = payload.get("body")
        if isinstance(nested_body, (dict, list)):
            return nested_body

        if isinstance(nested_body, str):
            stripped = nested_body.strip()
            if stripped.startswith("{") or stripped.startswith("["):
                try:
                    return json.loads(stripped)
                except json.JSONDecodeError:
                    pass

        return payload

    def _extract_hits_from_html(self, raw_html: str, topic: str, query: str) -> List[BrightDataHit]:
        title_matches = re.findall(r"<h3[^>]*>(.*?)</h3>", raw_html, flags=re.IGNORECASE | re.DOTALL)
        snippet_matches = re.findall(
            r"<div[^>]*data-sncf=\"1\"[^>]*>(.*?)</div>",
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        hits: List[BrightDataHit] = []
        for index, title in enumerate(title_matches[:3]):
            snippet = snippet_matches[index] if index < len(snippet_matches) else ""
            clean_title = self._clean_text(title)
            clean_snippet = self._clean_text(snippet)
            if not clean_title and not clean_snippet:
                continue
            hits.append(
                BrightDataHit(
                    topic=topic,
                    query=query,
                    title=clean_title,
                    snippet=clean_snippet,
                    rank=index + 1,
                )
            )
        return hits

    def _clean_text(self, value: object) -> str:
        if not isinstance(value, str):
            return ""
        text = unescape(re.sub(r"<[^>]+>", " ", value))
        text = re.sub(r"\s+", " ", text).strip()
        return text[:320]
