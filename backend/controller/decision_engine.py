from __future__ import annotations

from typing import Dict, List

from backend.agents.base import Agent
from backend.controller.schemas import AgentTurn, ConflictRecord, FinalDecision, RoundSummary


STANCE_MAP = {"GO": 1.0, "MODIFY": 0.15, "NO GO": -1.0}


class DecisionEngine:
    def decide(
        self,
        agents: List[Agent],
        conversation: List[AgentTurn],
        round_summaries: List[RoundSummary],
        conflicts: List[ConflictRecord],
    ) -> FinalDecision:
        latest_turns: Dict[str, AgentTurn] = {}
        agent_weights = {agent.profile.definition.name: agent.profile.weight for agent in agents}
        for turn in conversation:
            latest_turns[turn.agent_name] = turn

        weighted_score = 0.0
        total_weight = 0.0
        key_reasons: List[str] = []
        risks: List[str] = []
        recommended_actions: List[str] = []

        for agent_name, turn in latest_turns.items():
            if agent_name == "CEO Agent":
                continue
            weight = agent_weights[agent_name]
            total_weight += weight
            weighted_score += STANCE_MAP[turn.stance] * weight * (turn.confidence / 100)

        normalized = weighted_score / total_weight if total_weight else 0.0
        finance_turn = latest_turns.get("Finance Agent")
        risk_turn = latest_turns.get("Risk Agent")
        supply_turn = latest_turns.get("Supply Chain Agent")
        unresolved_conflicts = [conflict for conflict in conflicts if conflict.round == 3][:4]

        if normalized >= 0.22:
            decision = "GO"
        elif normalized <= -0.18:
            decision = "NO GO"
        else:
            decision = "MODIFY"

        if finance_turn and risk_turn and finance_turn.stance == "NO GO" and risk_turn.stance == "NO GO":
            decision = "NO GO" if normalized < 0.08 else "MODIFY"
            risks.append("Finance and Risk both reject the current plan, which is a strong board-level veto signal.")

        if supply_turn and supply_turn.stance == "NO GO" and decision == "GO":
            decision = "MODIFY"
            risks.append("Supply Chain does not believe the current delivery model can support a full-speed launch.")

        for summary in round_summaries[-2:]:
            key_reasons.extend(summary.consensus_points[:1])
            risks.extend(summary.conflict_points[:1])

        for turn in latest_turns.values():
            for point in turn.key_points[:1]:
                if len(recommended_actions) < 5 and point not in recommended_actions:
                    recommended_actions.append(point)

        if unresolved_conflicts:
            risks.extend(conflict.description for conflict in unresolved_conflicts[:2])

        if not key_reasons:
            key_reasons.append("Board sentiment remains mixed, so the decision is based on weighted functional trade-offs.")
        if not risks:
            risks.append("The remaining risk lies in whether assumptions convert into measurable execution proof.")
        if not recommended_actions:
            recommended_actions.append("Convert the top assumptions into stage gates before capital is committed.")

        confidence = int(max(60, min(94, 68 + abs(normalized) * 20 - len(unresolved_conflicts) * 2)))
        return FinalDecision(
            decision=decision,
            confidence=confidence,
            key_reasons=key_reasons[:4],
            risks=risks[:4],
            recommended_actions=recommended_actions[:5],
        )
