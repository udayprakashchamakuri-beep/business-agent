from __future__ import annotations

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field


ActionStatus = Literal["executed", "skipped", "failed"]


class WatchProfileSummary(BaseModel):
    id: str
    label: str
    company_name: str
    industry: Optional[str] = None
    region: Optional[str] = None
    active: bool = True
    last_checked_at: Optional[str] = None
    latest_signal_summary: str = "Waiting for the first monitor cycle."
    last_outcome: str = "Still watching."
    demand_score: Optional[float] = None
    risk_score: Optional[float] = None
    roi_pct: Optional[float] = None
    payback_months: Optional[float] = None


class ActionLogEntry(BaseModel):
    id: str
    watch_id: str
    watch_label: str
    action_type: str
    title: str
    reason: str
    status: ActionStatus
    executor: str
    executed_at: str
    result_summary: str = ""


class TaskItemEntry(BaseModel):
    id: str
    watch_id: str
    watch_label: str
    title: str
    description: str
    status: str
    created_at: str


class RunLogEntry(BaseModel):
    id: str
    started_at: str
    completed_at: Optional[str] = None
    status: str
    trigger_source: str
    watches_scanned: int = 0
    actions_taken: int = 0
    summary: str = ""


class AutonomyStatusResponse(BaseModel):
    scheduler_mode: str
    background_running: bool
    poll_interval_seconds: int
    next_run_hint: str
    watch_profiles: List[WatchProfileSummary] = Field(default_factory=list)
    recent_actions: List[ActionLogEntry] = Field(default_factory=list)
    open_tasks: List[TaskItemEntry] = Field(default_factory=list)
    recent_runs: List[RunLogEntry] = Field(default_factory=list)


class MonitorCycleResult(BaseModel):
    run_id: str
    watches_scanned: int
    actions_taken: int
    summary: str
    triggered_actions: List[ActionLogEntry] = Field(default_factory=list)


class TriggerDecision(BaseModel):
    action_type: str
    title: str
    reason: str
    payload: dict[str, Any] = Field(default_factory=dict)
    executors: List[str] = Field(default_factory=lambda: ["task"])
    cooldown_hours: int = 6
