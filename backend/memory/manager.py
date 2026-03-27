from __future__ import annotations

import json
import os
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import DefaultDict, Dict, Iterable, List

from backend.controller.schemas import (
    AgentTurn,
    AnalyzeRequest,
    ConflictRecord,
    ExplainabilityReport,
    FinalDecision,
    MemorySummary,
    RoundSummary,
)


class MemoryManager:
    STORAGE_PATH = Path(
        os.getenv(
            "MEMORY_STORAGE_PATH",
            str(
                (
                    Path(tempfile.gettempdir()) / "business_agent_persistent_history.json"
                    if os.getenv("VERCEL")
                    else Path(__file__).resolve().parent / "persistent_history.json"
                )
            ),
        )
    )
    BOARD_AGENTS = [
        "CEO Agent",
        "Startup Builder Agent",
        "Market Research Agent",
        "Finance Agent",
        "Marketing Agent",
        "Pricing Agent",
        "Supply Chain Agent",
        "Hiring Agent",
        "Risk Agent",
        "Sales Strategy Agent",
    ]

    def __init__(self, request: AnalyzeRequest | None = None) -> None:
        self.request = request
        self.global_history: List[AgentTurn] = []
        self.round_summaries: List[RoundSummary] = []
        self.persistent_records = self._load_records()
        self.relevant_records = self._match_records(request) if request else []
        self.agent_memory: DefaultDict[str, Dict[str, object]] = defaultdict(
            lambda: {
                "used_topics": [],
                "stance_history": [],
                "insights": [],
                "past_arguments": [],
                "past_failures": [],
                "memory_references": [],
            }
        )
        self._seed_agent_memory()

    def record_turn(self, turn: AgentTurn) -> None:
        self.global_history.append(turn)
        memory = self.agent_memory[turn.agent_name]
        memory["used_topics"] = list(dict.fromkeys(memory["used_topics"] + turn.topics))
        memory["stance_history"] = memory["stance_history"] + [turn.stance]
        memory["insights"] = memory["insights"] + turn.key_points
        memory["memory_references"] = list(dict.fromkeys(memory["memory_references"] + turn.memory_references))

    def summarize_round(self, round_number: int, turns: List[AgentTurn], conflicts: List[ConflictRecord]) -> RoundSummary:
        consensus_points: List[str] = []
        conflict_points = [conflict.description for conflict in conflicts if conflict.round == round_number][:3]
        open_questions: List[str] = []
        stances = [turn.stance for turn in turns]
        avg_confidence = round(sum(turn.confidence for turn in turns) / max(len(turns), 1), 1)
        avg_roi = round(
            sum(turn.estimated_metrics.get("expected_roi_pct", 0.0) for turn in turns) / max(len(turns), 1),
            1,
        )

        if stances.count("GO") >= 6:
            consensus_points.append("Growth upside is credible if the company sequences execution carefully.")
        if stances.count("NO GO") >= 3:
            consensus_points.append(
                "A meaningful part of the board believes current risk exposure is too high for an unconditional approval."
            )
        if any(turn.policy_positions.get("scope") == "narrow" for turn in turns):
            consensus_points.append("The board repeatedly prefers a narrower wedge over a broad initial rollout.")
        if not consensus_points:
            consensus_points.append("The board remains split and is converging through conditions rather than unanimity.")

        if conflict_points:
            open_questions.append("Which assumptions should be converted into stop-loss thresholds before launch?")
        if any(turn.policy_positions.get("pricing") in {"value-based", "value-forward"} for turn in turns):
            open_questions.append("Can the initial sales motion support the proposed pricing posture?")
        if any(turn.policy_positions.get("operating_model") in {"partner-led", "reliability-first"} for turn in turns):
            open_questions.append("How much operational control is needed before scaling into new segments or geographies?")

        synopsis = (
            f"Round {round_number} captured {stances.count('GO')} GO, {stances.count('MODIFY')} MODIFY, "
            f"and {stances.count('NO GO')} NO GO positions across the executive board."
        )
        summary = RoundSummary(
            round=round_number,
            synopsis=synopsis,
            consensus_points=consensus_points,
            conflict_points=conflict_points,
            open_questions=open_questions[:3],
            numeric_highlights={
                "average_confidence": avg_confidence,
                "average_expected_roi_pct": avg_roi,
                "conflict_count": float(len([conflict for conflict in conflicts if conflict.round == round_number])),
            },
        )
        self.round_summaries.append(summary)
        return summary

    def get_agent_memory(self, agent_name: str) -> Dict[str, object]:
        return self.agent_memory[agent_name]

    def build_memory_summary(self) -> MemorySummary:
        prior_failures: List[str] = []
        learned_adjustments: List[str] = []
        prior_agent_arguments: Dict[str, List[str]] = {}

        for record in self.relevant_records[:3]:
            for risk in record.get("risks", [])[:2]:
                if risk not in prior_failures:
                    prior_failures.append(risk)
            for note in record.get("learned_adjustments", [])[:2]:
                if note not in learned_adjustments:
                    learned_adjustments.append(note)
            for agent_name, arguments in record.get("agent_arguments", {}).items():
                prior_agent_arguments[agent_name] = list(
                    dict.fromkeys(prior_agent_arguments.get(agent_name, []) + arguments[:2])
                )

        return MemorySummary(
            recalled_simulations=len(self.relevant_records),
            prior_failures=prior_failures[:5],
            learned_adjustments=learned_adjustments[:5],
            prior_agent_arguments={key: value[:3] for key, value in prior_agent_arguments.items()},
        )

    def record_simulation(
        self,
        request: AnalyzeRequest,
        final_output: FinalDecision,
        explainability: ExplainabilityReport,
        conversation: List[AgentTurn],
    ) -> None:
        latest_turns: Dict[str, AgentTurn] = {}
        for turn in conversation:
            latest_turns[turn.agent_name] = turn

        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "memory_key": request.memory_key or request.company_name.lower().replace(" ", "-"),
            "company_name": request.company_name,
            "industry": request.industry,
            "scenario_name": request.scenario_name,
            "decision": final_output.decision,
            "confidence": final_output.confidence,
            "risks": final_output.risks,
            "learned_adjustments": final_output.recommended_actions[:3],
            "top_influencer": explainability.top_influencer,
            "agent_arguments": {
                agent_name: latest_turns[agent_name].key_points[:3]
                for agent_name in latest_turns
            },
        }
        self.persistent_records.append(record)
        self._save_records(self.persistent_records[-20:])

    def _seed_agent_memory(self) -> None:
        agent_names = set(self.BOARD_AGENTS)
        for record in self.relevant_records[:3]:
            agent_names.update(record.get("agent_arguments", {}).keys())
            for agent_name, arguments in record.get("agent_arguments", {}).items():
                memory = self.agent_memory[agent_name]
                memory["past_arguments"] = list(dict.fromkeys(memory["past_arguments"] + arguments[:3]))
            for agent_name in agent_names:
                memory = self.agent_memory[agent_name]
                memory["past_failures"] = list(dict.fromkeys(memory["past_failures"] + record.get("risks", [])[:2]))
                influencer = record.get("top_influencer")
                if influencer:
                    memory["memory_references"] = list(
                        dict.fromkeys(
                            memory["memory_references"]
                            + [f"Previous simulation favored {influencer} on {record.get('scenario_name', 'a prior scenario')}."]
                        )
                    )

    def _match_records(self, request: AnalyzeRequest) -> List[dict]:
        if request is None:
            return []

        memory_key = request.memory_key or request.company_name.lower().replace(" ", "-")
        matched = [
            record
            for record in self.persistent_records
            if record.get("memory_key") == memory_key
            or (request.industry and record.get("industry") == request.industry)
            or record.get("company_name") == request.company_name
        ]
        return list(reversed(matched))[:5]

    def _load_records(self) -> List[dict]:
        if not self.STORAGE_PATH.exists():
            return []
        try:
            with self.STORAGE_PATH.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
                return payload if isinstance(payload, list) else []
        except (OSError, json.JSONDecodeError):
            return []

    def _save_records(self, records: List[dict]) -> None:
        try:
            self.STORAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
            with self.STORAGE_PATH.open("w", encoding="utf-8") as handle:
                json.dump(records, handle, indent=2)
        except OSError:
            # Serverless deployments may not guarantee durable writable storage.
            return
