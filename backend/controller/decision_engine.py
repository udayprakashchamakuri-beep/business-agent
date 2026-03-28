from __future__ import annotations

from statistics import mean
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
        roi_points: List[float] = []
        payback_points: List[float] = []
        key_reasons: List[str] = []
        risks: List[str] = []
        recommended_actions: List[str] = []

        for agent_name, turn in latest_turns.items():
            if agent_name == "CEO Agent":
                continue
            weight = agent_weights[agent_name]
            total_weight += weight
            weighted_score += STANCE_MAP[turn.stance] * weight * (turn.confidence / 100)
            if "expected_roi_pct" in turn.estimated_metrics:
                roi_points.append(turn.estimated_metrics["expected_roi_pct"])
            if "estimated_payback_months" in turn.estimated_metrics:
                payback_points.append(turn.estimated_metrics["estimated_payback_months"])

        normalized = weighted_score / total_weight if total_weight else 0.0
        avg_roi = mean(roi_points) if roi_points else 0.0
        avg_payback = mean(payback_points) if payback_points else 0.0

        finance_turn = latest_turns.get("Finance Agent")
        risk_turn = latest_turns.get("Risk Agent")
        supply_turn = latest_turns.get("Supply Chain Agent")
        hiring_turn = latest_turns.get("Hiring Agent")
        critical_conflicts = [conflict for conflict in conflicts if conflict.impact == "High"]

        if normalized >= 0.24 and avg_roi >= 18 and avg_payback <= 18:
            decision = "GO"
        elif normalized <= -0.18 or avg_roi < 5 or avg_payback >= 24:
            decision = "NO GO"
        else:
            decision = "MODIFY"

        if finance_turn and risk_turn and finance_turn.stance == "NO GO" and risk_turn.stance == "NO GO":
            decision = "NO GO" if avg_roi < 18 else "MODIFY"
            risks.append("Finance and Risk jointly rejected the current plan, creating a board-level veto on a full launch.")

        if finance_turn and finance_turn.stance == "NO GO" and decision == "GO":
            decision = "MODIFY"
            risks.append("Finance blocked an unconditional launch because the modeled economics have not cleared the safety threshold.")

        if risk_turn and risk_turn.stance == "NO GO" and decision == "GO":
            decision = "MODIFY"
            risks.append("Risk blocked an unconditional launch because the mitigation layer is still too thin.")

        if supply_turn and supply_turn.stance == "NO GO" and decision == "GO":
            decision = "MODIFY"
            risks.append("Supply Chain does not believe the current delivery model can support a full-speed launch.")

        if hiring_turn and hiring_turn.stance == "NO GO" and decision == "GO":
            decision = "MODIFY"
            risks.append("Hiring believes org capacity is too tight for a broad expansion without a narrower first phase.")

        key_reasons.append(
            self._build_plain_language_summary(
                normalized=normalized,
                avg_roi=avg_roi,
                avg_payback=avg_payback,
            )
        )

        for summary in round_summaries[-2:]:
            for point in summary.consensus_points[:2]:
                if point not in key_reasons:
                    key_reasons.append(point)

        for turn in sorted(
            latest_turns.values(),
            key=lambda item: agent_weights.get(item.agent_name, 1.0) * item.confidence,
            reverse=True,
        ):
            for point in turn.key_points[:2]:
                if point not in recommended_actions:
                    recommended_actions.append(point)
            if turn.stance in {"NO GO", "MODIFY"}:
                candidate_risk = turn.assumptions[0] if turn.assumptions else turn.message
                if candidate_risk not in risks:
                    risks.append(candidate_risk)

        for conflict in critical_conflicts[:3]:
            if conflict.description not in risks:
                risks.append(f"{conflict.conflict_type}: {conflict.description}")

        if decision == "GO":
            key_reasons.append("Supportive functions believe the opportunity clears the economic hurdle if execution remains disciplined.")
        elif decision == "NO GO":
            key_reasons.append("The board does not believe the current mix of economics, risk, and operational readiness is strong enough to proceed.")
        else:
            key_reasons.append("The board sees enough upside to continue, but only behind a narrower and more controlled execution path.")

        if not recommended_actions:
            recommended_actions.append("Convert the top assumptions into stage gates before capital is committed.")

        confidence = int(
            max(
                60,
                min(
                    95,
                    70
                    + abs(normalized) * 18
                    + (6 if avg_roi >= 18 else -4)
                    - min(len(critical_conflicts), 3) * 3,
                ),
            )
        )

        return FinalDecision(
            decision=decision,
            confidence=confidence,
            key_reasons=key_reasons[:5],
            risks=risks[:5],
            recommended_actions=recommended_actions[:6],
        )

    def _build_plain_language_summary(self, normalized: float, avg_roi: float, avg_payback: float) -> str:
        if normalized >= 0.18:
            sentiment = "mostly positive"
        elif normalized >= 0.05:
            sentiment = "slightly positive"
        elif normalized > -0.05:
            sentiment = "mixed"
        elif normalized > -0.18:
            sentiment = "slightly cautious"
        else:
            sentiment = "strongly cautious"

        if avg_roi < 0:
            return_text = f"the current model points to a loss of about {abs(avg_roi):.1f}%"
        else:
            return_text = f"the current model points to about {avg_roi:.1f}% return"

        return (
            f"The team felt {sentiment} overall. Based on the current assumptions, {return_text}, "
            f"and it would take about {avg_payback:.1f} months to earn the upfront money back."
        )
