from __future__ import annotations

import json
import logging
import os
import smtplib
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from statistics import mean
from threading import Event, Lock, Thread
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.agents.reasoning import BusinessSignals, StrategicReasoner
from backend.autonomy.default_watchlist import default_watch_profiles
from backend.autonomy.schemas import ActionLogEntry, AutonomyStatusResponse, MonitorCycleResult, TriggerDecision
from backend.autonomy.store import AutonomyStore
from backend.controller.schemas import AnalyzeRequest

logger = logging.getLogger("business_agent.autonomy")


@dataclass
class WatchContext:
    id: str
    label: str
    company_name: str
    industry: str | None
    region: str | None
    request: AnalyzeRequest


class AutonomousMonitorService:
    def __init__(self) -> None:
        self.store = AutonomyStore()
        self.poll_interval_seconds = int(os.getenv("AUTONOMY_POLL_SECONDS", "300"))
        self._stop_event = Event()
        self._cycle_lock = Lock()
        self._thread: Optional[Thread] = None

    def initialize(self) -> None:
        self.store.initialize()
        self.store.seed_watch_profiles(default_watch_profiles())

    @property
    def background_enabled(self) -> bool:
        raw = os.getenv("ENABLE_AUTONOMOUS_MONITOR")
        if raw is None:
            return not bool(os.getenv("VERCEL"))
        return raw.lower() == "true"

    def scheduler_mode(self) -> str:
        if self.background_enabled:
            return "background worker"
        if os.getenv("VERCEL"):
            return "cron-ready serverless mode"
        return "manual mode"

    def start(self) -> None:
        if not self.background_enabled or self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = Thread(target=self._worker_loop, name="autonomy-monitor", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

    def is_running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def get_status(self) -> AutonomyStatusResponse:
        recent_runs = self.store.recent_runs()
        last_run = recent_runs[0] if recent_runs else None
        next_run_hint = (
            f"Runs every {self.poll_interval_seconds} seconds while the worker is alive."
            if self.background_enabled
            else "Use the monitor endpoint or scheduled cron call to trigger the next cycle."
        )
        if last_run and last_run.completed_at:
            next_run_hint = f"Last finished {last_run.completed_at}. {next_run_hint}"
        return AutonomyStatusResponse(
            scheduler_mode=self.scheduler_mode(),
            background_running=self.is_running(),
            poll_interval_seconds=self.poll_interval_seconds,
            next_run_hint=next_run_hint,
            watch_profiles=self.store.watch_summaries(),
            recent_actions=self.store.recent_actions(),
            open_tasks=self.store.open_tasks(),
            recent_runs=recent_runs,
        )

    def run_cycle(self, trigger_source: str = "manual") -> MonitorCycleResult:
        if not self._cycle_lock.acquire(blocking=False):
            raise RuntimeError("The autonomous monitor is already running a cycle.")

        run_id = self.store.start_run(trigger_source)
        triggered_actions: list[ActionLogEntry] = []
        watches_scanned = 0
        status = "completed"
        summary = "Monitor cycle finished without any watch profiles."

        try:
            watch_profiles = self.store.active_watch_profiles()
            watches_scanned = len(watch_profiles)
            reasoner = StrategicReasoner()

            for watch_profile in watch_profiles:
                watch = WatchContext(
                    id=watch_profile["id"],
                    label=watch_profile["label"],
                    company_name=watch_profile["company_name"],
                    industry=watch_profile.get("industry"),
                    region=watch_profile.get("region"),
                    request=AnalyzeRequest(**watch_profile["request"]),
                )
                previous_snapshot = self.store.latest_snapshot_for_watch(watch.id)
                signals = reasoner.analyze_request(watch.request)
                snapshot = self._build_snapshot(signals)
                self.store.record_signal_snapshot(watch.id, snapshot)
                decisions = self._evaluate_triggers(watch, snapshot, previous_snapshot)
                last_outcome = decisions[0].title if decisions else "No action needed right now."
                self.store.update_watch_status(
                    watch.id,
                    checked_at=snapshot["collected_at"],
                    summary=snapshot["signal_summary"],
                    decision=last_outcome,
                )
                for decision in decisions:
                    triggered_actions.extend(self._execute_decision(run_id, watch, snapshot, decision))

            if watches_scanned:
                summary = f"Scanned {watches_scanned} watched businesses and executed {len(triggered_actions)} action logs."
        except Exception as exc:  # pragma: no cover - defensive logging
            status = "failed"
            summary = f"Monitor cycle failed: {exc}"
            logger.exception("autonomy.run_cycle_failed error=%s", exc)
            raise
        finally:
            self.store.finish_run(
                run_id=run_id,
                status=status,
                watches_scanned=watches_scanned,
                actions_taken=len(triggered_actions),
                summary=summary,
            )
            self._cycle_lock.release()

        return MonitorCycleResult(
            run_id=run_id,
            watches_scanned=watches_scanned,
            actions_taken=len(triggered_actions),
            summary=summary,
            triggered_actions=triggered_actions,
        )

    def _worker_loop(self) -> None:
        run_immediately = os.getenv("AUTONOMY_RUN_ON_STARTUP", "true").lower() == "true"
        while not self._stop_event.is_set():
            if run_immediately:
                run_immediately = False
            else:
                if self._stop_event.wait(self.poll_interval_seconds):
                    break
            try:
                self.run_cycle(trigger_source="background")
            except Exception:
                continue

    def _build_snapshot(self, signals: BusinessSignals) -> dict[str, Any]:
        derived = signals.derived_metrics
        demand_score = round(mean([signals.market_attractiveness, signals.growth_potential]), 1)
        risk_score = round(
            mean(
                [
                    signals.operational_complexity,
                    signals.compliance_risk,
                    signals.differentiation_pressure,
                    signals.sales_friction,
                ]
            ),
            1,
        )
        evidence = (signals.evidence + signals.external_research.summaries(limit=4))[:6]
        summary = (
            f"Demand is at {demand_score:.1f}/100 while risk pressure is {risk_score:.1f}/100. "
            f"Modeled yearly revenue is about ${derived.get('projected_annual_revenue', 0):,.0f} with payback in "
            f"{derived.get('estimated_payback_months', 0):.1f} months."
        )
        return {
            "collected_at": self._utc_now(),
            "demand_score": demand_score,
            "risk_score": risk_score,
            "market_attractiveness": signals.market_attractiveness,
            "growth_potential": signals.growth_potential,
            "financial_viability": signals.financial_viability,
            "operational_complexity": signals.operational_complexity,
            "compliance_risk": signals.compliance_risk,
            "pricing_power": signals.pricing_power,
            "sales_friction": signals.sales_friction,
            "differentiation_pressure": signals.differentiation_pressure,
            "projected_annual_revenue": derived.get("projected_annual_revenue", 0.0),
            "expected_roi_pct": derived.get("expected_roi_pct", 0.0),
            "estimated_payback_months": derived.get("estimated_payback_months", 0.0),
            "signal_summary": summary,
            "evidence": evidence,
        }

    def _evaluate_triggers(
        self,
        watch: WatchContext,
        snapshot: dict[str, Any],
        previous_snapshot: Optional[dict[str, Any]],
    ) -> list[TriggerDecision]:
        decisions: list[TriggerDecision] = []
        demand_score = float(snapshot.get("demand_score", 0))
        risk_score = float(snapshot.get("risk_score", 0))
        roi = float(snapshot.get("expected_roi_pct", 0))
        payback = float(snapshot.get("estimated_payback_months", 0))
        financial_viability = float(snapshot.get("financial_viability", 0))
        pricing_power = float(snapshot.get("pricing_power", 0))
        sales_friction = float(snapshot.get("sales_friction", 0))

        if previous_snapshot:
            prior_demand = float(previous_snapshot.get("demand_score", demand_score))
            prior_risk = float(previous_snapshot.get("risk_score", risk_score))
            if demand_score <= prior_demand - 8 and risk_score >= prior_risk + 8:
                decisions.append(
                    TriggerDecision(
                        action_type="tighten-spend",
                        title="Tighten spending and slow the rollout",
                        reason=(
                            f"{watch.label} lost demand momentum from {prior_demand:.1f} to {demand_score:.1f} while "
                            f"risk rose from {prior_risk:.1f} to {risk_score:.1f}. The system is responding by tightening spend."
                        ),
                        payload={
                            "demand_before": prior_demand,
                            "demand_now": demand_score,
                            "risk_before": prior_risk,
                            "risk_now": risk_score,
                        },
                        executors=["task", "webhook", "email"],
                        cooldown_hours=8,
                    )
                )

        if financial_viability < 45 or risk_score > 66 or payback > 14:
            decisions.append(
                TriggerDecision(
                    action_type="pause-expansion",
                    title="Pause expansion and review the plan",
                    reason=(
                        f"{watch.label} is showing weak financial room ({financial_viability:.1f}/100), elevated risk "
                        f"({risk_score:.1f}/100), or a slow payback ({payback:.1f} months). The system is pausing expansion."
                    ),
                    payload={
                        "financial_viability": financial_viability,
                        "risk_score": risk_score,
                        "payback_months": payback,
                    },
                    executors=["task", "email", "tool_call"],
                    cooldown_hours=12,
                )
            )

        if demand_score >= 68 and financial_viability >= 60 and risk_score <= 48 and roi >= 35:
            decisions.append(
                TriggerDecision(
                    action_type="scale-pilot",
                    title="Scale the pilot to the next checkpoint",
                    reason=(
                        f"{watch.label} is showing strong demand ({demand_score:.1f}/100), healthy finances "
                        f"({financial_viability:.1f}/100), and manageable risk ({risk_score:.1f}/100). The system is moving the pilot forward."
                    ),
                    payload={
                        "demand_score": demand_score,
                        "financial_viability": financial_viability,
                        "risk_score": risk_score,
                        "expected_roi_pct": roi,
                    },
                    executors=["task", "webhook", "tool_call"],
                    cooldown_hours=8,
                )
            )

        if pricing_power < 45 and sales_friction > 60:
            decisions.append(
                TriggerDecision(
                    action_type="review-pricing",
                    title="Review pricing and the sales offer",
                    reason=(
                        f"{watch.label} is facing weak pricing power ({pricing_power:.1f}/100) together with a heavy sales path "
                        f"({sales_friction:.1f}/100). The system is creating a pricing review task."
                    ),
                    payload={
                        "pricing_power": pricing_power,
                        "sales_friction": sales_friction,
                    },
                    executors=["task", "tool_call"],
                    cooldown_hours=10,
                )
            )

        deduped: list[TriggerDecision] = []
        seen_types: set[str] = set()
        for decision in decisions:
            if decision.action_type in seen_types:
                continue
            if self.store.has_recent_action(watch.id, decision.action_type, decision.cooldown_hours):
                continue
            seen_types.add(decision.action_type)
            deduped.append(decision)
        return deduped

    def _execute_decision(
        self,
        run_id: str,
        watch: WatchContext,
        snapshot: dict[str, Any],
        decision: TriggerDecision,
    ) -> list[ActionLogEntry]:
        logs: list[ActionLogEntry] = []
        payload = {
            **decision.payload,
            "watch_id": watch.id,
            "watch_label": watch.label,
            "company_name": watch.company_name,
            "signal_summary": snapshot["signal_summary"],
            "roi_pct": snapshot.get("expected_roi_pct"),
            "payback_months": snapshot.get("estimated_payback_months"),
        }

        for executor in decision.executors:
            if executor == "task":
                task = self.store.create_task(
                    watch_id=watch.id,
                    watch_label=watch.label,
                    title=decision.title,
                    description=decision.reason,
                    payload=payload,
                )
                logs.append(
                    self.store.record_action(
                        run_id=run_id,
                        watch_id=watch.id,
                        watch_label=watch.label,
                        action_type=decision.action_type,
                        title=decision.title,
                        reason=decision.reason,
                        payload=payload,
                        status="executed",
                        executor="task",
                        result={"summary": f"Created internal task {task.id}."},
                    )
                )
                continue

            if executor == "webhook":
                logs.append(self._execute_webhook(run_id, watch, decision, payload))
                continue

            if executor == "email":
                logs.append(self._execute_email(run_id, watch, decision, payload))
                continue

            if executor == "tool_call":
                logs.append(self._execute_tool_call(run_id, watch, decision, payload))

        return logs

    def _execute_webhook(self, run_id: str, watch: WatchContext, decision: TriggerDecision, payload: dict[str, Any]) -> ActionLogEntry:
        endpoint = os.getenv("AUTONOMY_WEBHOOK_URL", "").strip()
        if not endpoint:
            return self.store.record_action(
                run_id,
                watch.id,
                watch.label,
                decision.action_type,
                decision.title,
                decision.reason,
                payload,
                "skipped",
                "webhook",
                {"summary": "Webhook executor skipped because AUTONOMY_WEBHOOK_URL is not configured."},
            )

        headers = {"Content-Type": "application/json"}
        auth_token = os.getenv("AUTONOMY_WEBHOOK_BEARER", "").strip()
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
        request = Request(endpoint, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urlopen(request, timeout=4.0) as response:
                summary = f"Webhook sent with status {response.status}."
                status = "executed"
        except (HTTPError, URLError, TimeoutError) as exc:
            summary = f"Webhook failed: {exc}"
            status = "failed"

        return self.store.record_action(
            run_id,
            watch.id,
            watch.label,
            decision.action_type,
            decision.title,
            decision.reason,
            payload,
            status,
            "webhook",
            {"summary": summary},
        )

    def _execute_tool_call(self, run_id: str, watch: WatchContext, decision: TriggerDecision, payload: dict[str, Any]) -> ActionLogEntry:
        endpoint = os.getenv("AUTONOMY_TOOL_URL", "").strip()
        if not endpoint:
            return self.store.record_action(
                run_id,
                watch.id,
                watch.label,
                decision.action_type,
                decision.title,
                decision.reason,
                payload,
                "skipped",
                "tool_call",
                {"summary": "Tool-call executor skipped because AUTONOMY_TOOL_URL is not configured."},
            )

        request = Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=4.0) as response:
                summary = f"Tool call sent with status {response.status}."
                status = "executed"
        except (HTTPError, URLError, TimeoutError) as exc:
            summary = f"Tool call failed: {exc}"
            status = "failed"

        return self.store.record_action(
            run_id,
            watch.id,
            watch.label,
            decision.action_type,
            decision.title,
            decision.reason,
            payload,
            status,
            "tool_call",
            {"summary": summary},
        )

    def _execute_email(self, run_id: str, watch: WatchContext, decision: TriggerDecision, payload: dict[str, Any]) -> ActionLogEntry:
        recipients = [item.strip() for item in os.getenv("AUTONOMY_EMAIL_TO", "").split(",") if item.strip()]
        smtp_host = os.getenv("SMTP_HOST", "").strip()
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_username = os.getenv("SMTP_USERNAME", "").strip()
        smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
        smtp_from = os.getenv("SMTP_FROM", smtp_username).strip()

        if not recipients or not smtp_host or not smtp_from:
            return self.store.record_action(
                run_id,
                watch.id,
                watch.label,
                decision.action_type,
                decision.title,
                decision.reason,
                payload,
                "skipped",
                "email",
                {"summary": "Email executor skipped because SMTP settings or recipients are missing."},
            )

        message = EmailMessage()
        message["Subject"] = f"[Business Agent] {decision.title}"
        message["From"] = smtp_from
        message["To"] = ", ".join(recipients)
        message.set_content(
            f"Watch profile: {watch.label}\n\nAction: {decision.title}\n\nReason: {decision.reason}\n\n"
            f"Signal summary: {payload.get('signal_summary', '')}\n"
        )

        try:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=6) as server:
                server.starttls()
                if smtp_username:
                    server.login(smtp_username, smtp_password)
                server.send_message(message)
            summary = f"Email sent to {len(recipients)} recipient(s)."
            status = "executed"
        except (OSError, smtplib.SMTPException) as exc:
            summary = f"Email failed: {exc}"
            status = "failed"

        return self.store.record_action(
            run_id,
            watch.id,
            watch.label,
            decision.action_type,
            decision.title,
            decision.reason,
            payload,
            status,
            "email",
            {"summary": summary},
        )

    def _utc_now(self) -> str:
        return datetime.now(timezone.utc).isoformat()
