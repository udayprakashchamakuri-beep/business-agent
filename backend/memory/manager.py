from __future__ import annotations

from collections import defaultdict
from typing import DefaultDict, Dict, List

from backend.controller.schemas import AgentTurn, ConflictRecord, RoundSummary


class MemoryManager:
    def __init__(self) -> None:
        self.global_history: List[AgentTurn] = []
        self.round_summaries: List[RoundSummary] = []
        self.agent_memory: DefaultDict[str, Dict[str, object]] = defaultdict(
            lambda: {"used_topics": [], "stance_history": [], "insights": []}
        )

    def record_turn(self, turn: AgentTurn) -> None:
        self.global_history.append(turn)
        memory = self.agent_memory[turn.agent_name]
        memory["used_topics"] = list(dict.fromkeys(memory["used_topics"] + turn.topics))
        memory["stance_history"] = memory["stance_history"] + [turn.stance]
        memory["insights"] = memory["insights"] + turn.key_points

    def summarize_round(self, round_number: int, turns: List[AgentTurn], conflicts: List[ConflictRecord]) -> RoundSummary:
        consensus_points: List[str] = []
        conflict_points = [conflict.description for conflict in conflicts if conflict.round == round_number][:3]
        open_questions: List[str] = []
        stances = [turn.stance for turn in turns]

        if stances.count("GO") >= 6:
            consensus_points.append("Growth upside is credible if the company sequences execution carefully.")
        if stances.count("NO GO") >= 3:
            consensus_points.append("A meaningful part of the board believes current risk exposure is too high for an unconditional approval.")
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
        )
        self.round_summaries.append(summary)
        return summary

    def get_agent_memory(self, agent_name: str) -> Dict[str, object]:
        return self.agent_memory[agent_name]
