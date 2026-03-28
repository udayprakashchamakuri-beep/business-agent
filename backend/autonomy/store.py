from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from backend.autonomy.schemas import ActionLogEntry, RunLogEntry, TaskItemEntry, WatchProfileSummary


def _default_storage_path() -> Path:
    if os.getenv("VERCEL"):
        return Path(tempfile.gettempdir()) / "business_agent_autonomy.db"
    return Path(__file__).resolve().parent / "autonomy.db"


class AutonomyStore:
    def __init__(self) -> None:
        self.db_path = Path(os.getenv("AUTONOMY_STORAGE_PATH", str(_default_storage_path())))

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS watch_profiles (
                    id TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    company_name TEXT NOT NULL,
                    industry TEXT,
                    region TEXT,
                    active INTEGER NOT NULL DEFAULT 1,
                    request_json TEXT NOT NULL,
                    last_checked_at TEXT,
                    last_summary TEXT,
                    last_decision TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS signal_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    watch_id TEXT NOT NULL,
                    collected_at TEXT NOT NULL,
                    demand_score REAL,
                    risk_score REAL,
                    market_attractiveness REAL,
                    growth_potential REAL,
                    financial_viability REAL,
                    operational_complexity REAL,
                    compliance_risk REAL,
                    pricing_power REAL,
                    sales_friction REAL,
                    differentiation_pressure REAL,
                    projected_annual_revenue REAL,
                    expected_roi_pct REAL,
                    estimated_payback_months REAL,
                    signal_summary TEXT,
                    evidence_json TEXT,
                    FOREIGN KEY (watch_id) REFERENCES watch_profiles(id)
                );

                CREATE TABLE IF NOT EXISTS run_logs (
                    id TEXT PRIMARY KEY,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    status TEXT NOT NULL,
                    trigger_source TEXT NOT NULL,
                    watches_scanned INTEGER NOT NULL DEFAULT 0,
                    actions_taken INTEGER NOT NULL DEFAULT 0,
                    summary_json TEXT
                );

                CREATE TABLE IF NOT EXISTS action_logs (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    watch_id TEXT NOT NULL,
                    watch_label TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    payload_json TEXT,
                    status TEXT NOT NULL,
                    executor TEXT NOT NULL,
                    executed_at TEXT NOT NULL,
                    result_json TEXT,
                    FOREIGN KEY (watch_id) REFERENCES watch_profiles(id)
                );

                CREATE TABLE IF NOT EXISTS task_items (
                    id TEXT PRIMARY KEY,
                    watch_id TEXT NOT NULL,
                    watch_label TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    payload_json TEXT,
                    FOREIGN KEY (watch_id) REFERENCES watch_profiles(id)
                );
                """
            )

    def seed_watch_profiles(self, profiles: Iterable[dict]) -> None:
        now = self._utc_now()
        with self._connect() as connection:
            for profile in profiles:
                existing = connection.execute("SELECT id FROM watch_profiles WHERE id = ?", (profile["id"],)).fetchone()
                if existing:
                    continue
                connection.execute(
                    """
                    INSERT INTO watch_profiles (
                        id, label, company_name, industry, region, active, request_json,
                        last_checked_at, last_summary, last_decision, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
                    """,
                    (
                        profile["id"],
                        profile["label"],
                        profile["company_name"],
                        profile.get("industry"),
                        profile.get("region"),
                        1,
                        json.dumps(profile["request"]),
                        now,
                        now,
                    ),
                )

    def active_watch_profiles(self) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, label, company_name, industry, region, active, request_json,
                       last_checked_at, last_summary, last_decision
                FROM watch_profiles
                WHERE active = 1
                ORDER BY created_at ASC
                """
            ).fetchall()
        return [self._watch_row_to_dict(row) for row in rows]

    def latest_snapshot_for_watch(self, watch_id: str) -> Optional[dict[str, Any]]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM signal_snapshots
                WHERE watch_id = ?
                ORDER BY collected_at DESC, id DESC
                LIMIT 1
                """,
                (watch_id,),
            ).fetchone()
        return dict(row) if row else None

    def has_recent_action(self, watch_id: str, action_type: str, cooldown_hours: int) -> bool:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=cooldown_hours)).isoformat()
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id
                FROM action_logs
                WHERE watch_id = ? AND action_type = ? AND executed_at >= ? AND status = 'executed'
                ORDER BY executed_at DESC
                LIMIT 1
                """,
                (watch_id, action_type, cutoff),
            ).fetchone()
        return row is not None

    def record_signal_snapshot(self, watch_id: str, snapshot: dict[str, Any]) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO signal_snapshots (
                    watch_id, collected_at, demand_score, risk_score, market_attractiveness, growth_potential,
                    financial_viability, operational_complexity, compliance_risk, pricing_power, sales_friction,
                    differentiation_pressure, projected_annual_revenue, expected_roi_pct, estimated_payback_months,
                    signal_summary, evidence_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    watch_id,
                    snapshot["collected_at"],
                    snapshot.get("demand_score"),
                    snapshot.get("risk_score"),
                    snapshot.get("market_attractiveness"),
                    snapshot.get("growth_potential"),
                    snapshot.get("financial_viability"),
                    snapshot.get("operational_complexity"),
                    snapshot.get("compliance_risk"),
                    snapshot.get("pricing_power"),
                    snapshot.get("sales_friction"),
                    snapshot.get("differentiation_pressure"),
                    snapshot.get("projected_annual_revenue"),
                    snapshot.get("expected_roi_pct"),
                    snapshot.get("estimated_payback_months"),
                    snapshot.get("signal_summary"),
                    json.dumps(snapshot.get("evidence", [])),
                ),
            )

    def update_watch_status(self, watch_id: str, checked_at: str, summary: str, decision: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE watch_profiles
                SET last_checked_at = ?, last_summary = ?, last_decision = ?, updated_at = ?
                WHERE id = ?
                """,
                (checked_at, summary, decision, self._utc_now(), watch_id),
            )

    def start_run(self, trigger_source: str) -> str:
        run_id = f"run-{uuid.uuid4().hex[:12]}"
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO run_logs (id, started_at, status, trigger_source, watches_scanned, actions_taken, summary_json)
                VALUES (?, ?, 'running', ?, 0, 0, ?)
                """,
                (run_id, self._utc_now(), trigger_source, json.dumps({"summary": "Monitor cycle started."})),
            )
        return run_id

    def finish_run(self, run_id: str, status: str, watches_scanned: int, actions_taken: int, summary: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE run_logs
                SET completed_at = ?, status = ?, watches_scanned = ?, actions_taken = ?, summary_json = ?
                WHERE id = ?
                """,
                (
                    self._utc_now(),
                    status,
                    watches_scanned,
                    actions_taken,
                    json.dumps({"summary": summary}),
                    run_id,
                ),
            )

    def record_action(
        self,
        run_id: str,
        watch_id: str,
        watch_label: str,
        action_type: str,
        title: str,
        reason: str,
        payload: dict[str, Any],
        status: str,
        executor: str,
        result: dict[str, Any],
    ) -> ActionLogEntry:
        action_id = f"action-{uuid.uuid4().hex[:12]}"
        executed_at = self._utc_now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO action_logs (
                    id, run_id, watch_id, watch_label, action_type, title, reason,
                    payload_json, status, executor, executed_at, result_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    action_id,
                    run_id,
                    watch_id,
                    watch_label,
                    action_type,
                    title,
                    reason,
                    json.dumps(payload),
                    status,
                    executor,
                    executed_at,
                    json.dumps(result),
                ),
            )
        return ActionLogEntry(
            id=action_id,
            watch_id=watch_id,
            watch_label=watch_label,
            action_type=action_type,
            title=title,
            reason=reason,
            status=status,
            executor=executor,
            executed_at=executed_at,
            result_summary=str(result.get("summary", "")),
        )

    def create_task(self, watch_id: str, watch_label: str, title: str, description: str, payload: dict[str, Any]) -> TaskItemEntry:
        task_id = f"task-{uuid.uuid4().hex[:12]}"
        created_at = self._utc_now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO task_items (id, watch_id, watch_label, title, description, status, created_at, payload_json)
                VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
                """,
                (task_id, watch_id, watch_label, title, description, created_at, json.dumps(payload)),
            )
        return TaskItemEntry(
            id=task_id,
            watch_id=watch_id,
            watch_label=watch_label,
            title=title,
            description=description,
            status="open",
            created_at=created_at,
        )

    def recent_actions(self, limit: int = 12) -> list[ActionLogEntry]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, watch_id, watch_label, action_type, title, reason, status, executor, executed_at, result_json
                FROM action_logs
                ORDER BY executed_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        entries: list[ActionLogEntry] = []
        for row in rows:
            result_payload = self._parse_json(row["result_json"])
            entries.append(
                ActionLogEntry(
                    id=row["id"],
                    watch_id=row["watch_id"],
                    watch_label=row["watch_label"],
                    action_type=row["action_type"],
                    title=row["title"],
                    reason=row["reason"],
                    status=row["status"],
                    executor=row["executor"],
                    executed_at=row["executed_at"],
                    result_summary=str(result_payload.get("summary", "")),
                )
            )
        return entries

    def open_tasks(self, limit: int = 12) -> list[TaskItemEntry]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, watch_id, watch_label, title, description, status, created_at
                FROM task_items
                WHERE status = 'open'
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [
            TaskItemEntry(
                id=row["id"],
                watch_id=row["watch_id"],
                watch_label=row["watch_label"],
                title=row["title"],
                description=row["description"],
                status=row["status"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

    def recent_runs(self, limit: int = 10) -> list[RunLogEntry]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, started_at, completed_at, status, trigger_source, watches_scanned, actions_taken, summary_json
                FROM run_logs
                ORDER BY started_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [
            RunLogEntry(
                id=row["id"],
                started_at=row["started_at"],
                completed_at=row["completed_at"],
                status=row["status"],
                trigger_source=row["trigger_source"],
                watches_scanned=row["watches_scanned"],
                actions_taken=row["actions_taken"],
                summary=str(self._parse_json(row["summary_json"]).get("summary", "")),
            )
            for row in rows
        ]

    def watch_summaries(self) -> list[WatchProfileSummary]:
        with self._connect() as connection:
            watch_rows = connection.execute(
                """
                SELECT id, label, company_name, industry, region, active, last_checked_at, last_summary, last_decision
                FROM watch_profiles
                ORDER BY created_at ASC
                """
            ).fetchall()
            snapshot_rows = connection.execute(
                """
                SELECT s.*
                FROM signal_snapshots s
                INNER JOIN (
                    SELECT watch_id, MAX(id) AS max_id
                    FROM signal_snapshots
                    GROUP BY watch_id
                ) latest ON latest.watch_id = s.watch_id AND latest.max_id = s.id
                """
            ).fetchall()
        snapshots = {row["watch_id"]: dict(row) for row in snapshot_rows}
        return [
            WatchProfileSummary(
                id=row["id"],
                label=row["label"],
                company_name=row["company_name"],
                industry=row["industry"],
                region=row["region"],
                active=bool(row["active"]),
                last_checked_at=row["last_checked_at"],
                latest_signal_summary=row["last_summary"] or "Waiting for the first monitor cycle.",
                last_outcome=row["last_decision"] or "Still watching.",
                demand_score=snapshots.get(row["id"], {}).get("demand_score"),
                risk_score=snapshots.get(row["id"], {}).get("risk_score"),
                roi_pct=snapshots.get(row["id"], {}).get("expected_roi_pct"),
                payback_months=snapshots.get(row["id"], {}).get("estimated_payback_months"),
            )
            for row in watch_rows
        ]

    def _watch_row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        payload = self._parse_json(row["request_json"])
        return {
            "id": row["id"],
            "label": row["label"],
            "company_name": row["company_name"],
            "industry": row["industry"],
            "region": row["region"],
            "active": bool(row["active"]),
            "request": payload,
            "last_checked_at": row["last_checked_at"],
            "last_summary": row["last_summary"],
            "last_decision": row["last_decision"],
        }

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _parse_json(self, raw_value: Any) -> dict[str, Any]:
        if not raw_value:
            return {}
        if isinstance(raw_value, dict):
            return raw_value
        try:
            payload = json.loads(raw_value)
            return payload if isinstance(payload, dict) else {}
        except (TypeError, json.JSONDecodeError):
            return {}

    def _utc_now(self) -> str:
        return datetime.now(timezone.utc).isoformat()
