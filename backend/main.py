from __future__ import annotations

import json
import os
from queue import Queue
from threading import Thread

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from backend.config.env import load_local_env
from backend.controller.orchestrator import EnterpriseOrchestrator
from backend.controller.schemas import AnalyzeRequest, AnalyzeResponse

load_local_env()

app = FastAPI(
    title="Autonomous AI Enterprise Simulator",
    version="1.0.0",
    description="A multi-agent enterprise simulator that debates, stores memory, detects conflict, and issues board-level decisions.",
)

frontend_origins = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://udayprakashchamakuri-beep.github.io",
}
extra_origin = os.getenv("FRONTEND_ORIGIN")
if extra_origin:
    frontend_origins.add(extra_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(frontend_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = EnterpriseOrchestrator()


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    return orchestrator.analyze(request)


@app.post("/analyze/stream")
def analyze_stream(request: AnalyzeRequest) -> StreamingResponse:
    def event_stream():
        queue: Queue[dict[str, object] | None] = Queue()

        def emit(payload: dict[str, object]) -> None:
            queue.put(payload)

        def run_analysis() -> None:
            try:
                orchestrator.stream_analyze(request, emit)
            except Exception as exc:  # pragma: no cover - surfaced to stream clients
                queue.put({"type": "error", "error": str(exc)})
            finally:
                queue.put(None)

        Thread(target=run_analysis, daemon=True).start()

        while True:
            payload = queue.get()
            if payload is None:
                break
            yield json.dumps(payload) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")
