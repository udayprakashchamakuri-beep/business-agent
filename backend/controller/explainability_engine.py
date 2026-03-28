from __future__ import annotations

from typing import Dict, List

from backend.agents.base import Agent
from backend.controller.schemas import AgentTurn, ConflictRecord, ExplainabilityReport, ReasoningTraceItem


class ExplainabilityEngine:
    def build(
        self,
        agents: List[Agent],
        conversation: List[AgentTurn],
        conflicts: List[ConflictRecord],
        final_decision: str,
    ) -> ExplainabilityReport:
        latest_turns: Dict[str, AgentTurn] = {}
        weights = {agent.profile.definition.name: agent.profile.weight for agent in agents}
        for turn in conversation:
            latest_turns[turn.agent_name] = turn

        traces: List[ReasoningTraceItem] = []
        for turn in latest_turns.values():
            decision_alignment = self._alignment_score(turn.stance, final_decision)
            influence_score = round(
                weights.get(turn.agent_name, 1.0)
                * (turn.confidence / 100)
                * decision_alignment
                * (1 + len(turn.references) * 0.08 + len(turn.challenged_agents) * 0.05),
                3,
            )
            summary = turn.key_points[0] if turn.key_points else turn.message
            traces.append(
                ReasoningTraceItem(
                    agent_name=turn.agent_name,
                    influence_score=influence_score,
                    stance=turn.stance,
                    summary=summary,
                )
            )

        traces.sort(key=lambda item: item.influence_score, reverse=True)
        top_influencer = traces[0].agent_name if traces else "CEO Agent"
        conflict_summaries = [
            f"{conflict.conflict_type} ({', '.join(conflict.agents)}): {conflict.description}"
            for conflict in conflicts[:4]
        ]
        final_reasoning_summary = self._build_reasoning_summary(traces, conflicts, final_decision)

        return ExplainabilityReport(
            top_influencer=top_influencer,
            conflicts=conflict_summaries,
            final_reasoning_summary=final_reasoning_summary,
            reasoning_trace=traces[:6],
        )

    def _alignment_score(self, stance: str, final_decision: str) -> float:
        if stance == final_decision:
            return 1.0
        if stance == "MODIFY" or final_decision == "MODIFY":
            return 0.7
        return 0.35

    def _build_reasoning_summary(
        self,
        traces: List[ReasoningTraceItem],
        conflicts: List[ConflictRecord],
        final_decision: str,
    ) -> str:
        if not traces:
            return "The board did not generate enough signal to explain the decision."

        lead = traces[0]
        tail = traces[1:3]
        disagreement_summary = (
            f"The biggest disagreement was about {conflicts[0].conflict_type.lower()}."
            if conflicts
            else "The team disagreed on some details, but most people moved toward the same overall direction."
        )
        challenger_names = ", ".join(item.agent_name for item in tail) if tail else "the rest of the board"
        return (
            f"The team ended up at {final_decision} mainly because {lead.agent_name} had the strongest influence, "
            f"while {challenger_names} helped shape the conditions and trade-offs around that choice. {disagreement_summary}"
        )
