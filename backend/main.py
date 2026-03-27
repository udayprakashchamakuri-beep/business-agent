from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.controller.orchestrator import EnterpriseOrchestrator
from backend.controller.schemas import AnalyzeRequest, AnalyzeResponse

app = FastAPI(
    title="Autonomous AI Enterprise Simulator",
    version="1.0.0",
    description="A multi-agent enterprise simulator that debates, stores memory, detects conflict, and issues board-level decisions.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
