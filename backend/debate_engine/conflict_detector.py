from __future__ import annotations

from itertools import combinations
from typing import Dict, List, Tuple

from backend.controller.schemas import AgentTurn, ConflictRecord


OPPOSING_VALUES: Dict[str, Dict[str, str]] = {
    "pace": {"aggressive": "cautious", "cautious": "aggressive"},
    "scope": {"narrow": "broad", "broad": "narrow"},
    "pricing": {"value-forward": "margin-protective", "margin-protective": "value-forward", "value-based": "simple"},
    "risk_posture": {"control-first": "accept", "accept": "control-first"},
    "channel": {"quality-over-volume": "diversified", "diversified": "quality-over-volume"},
    "investment": {"sequenced": "accelerated", "accelerated": "sequenced"},
    "decision_gate": {"economic-thresholds": "weekly-milestones", "weekly-milestones": "stop-loss", "stop-loss": "weekly-milestones"},
}

CONFLICT_CLASSIFICATIONS: Dict[frozenset[str], Tuple[str, str]] = {
    frozenset({"Finance Agent", "Marketing Agent"}): ("Cost vs Growth", "High"),
    frozenset({"Finance Agent", "Startup Builder Agent"}): ("Capital discipline vs Speed", "High"),
    frozenset({"Risk Agent", "Startup Builder Agent"}): ("Risk vs Expansion", "High"),
    frozenset({"Risk Agent", "Marketing Agent"}): ("Risk vs Growth narrative", "Medium"),
    frozenset({"Pricing Agent", "Sales Strategy Agent"}): ("Monetization vs Conversion", "Medium"),
    frozenset({"Supply Chain Agent", "Startup Builder Agent"}): ("Operations vs Speed", "High"),
    frozenset({"Hiring Agent", "Startup Builder Agent"}): ("Capacity vs Expansion", "Medium"),
}


class ConflictDetector:
    def detect(self, round_number: int, turns: List[AgentTurn]) -> List[ConflictRecord]:
        conflicts: List[ConflictRecord] = []
        seen: set[Tuple[int, str, str, str]] = set()

        for left, right in combinations(turns, 2):
            if left.stance != right.stance:
                key = (round_number, "board stance", left.agent_name, right.agent_name)
                if key not in seen:
                    conflict_type, impact = self._classify_conflict(left.agent_name, right.agent_name, "board stance")
                    conflicts.append(
                        ConflictRecord(
                            round=round_number,
                            topic="board stance",
                            agents=[left.agent_name, right.agent_name],
                            opposing_agents=[left.agent_name, right.agent_name],
                            description=(
                                f"{left.agent_name} is {left.stance} while {right.agent_name} is {right.stance}, "
                                "showing a direct recommendation split."
                            ),
                            severity=min(5, 2 + abs(left.confidence - right.confidence) // 20),
                            conflict_type=conflict_type,
                            impact=impact,
                        )
                    )
                    seen.add(key)

            for topic, value in left.policy_positions.items():
                other_value = right.policy_positions.get(topic)
                if other_value is None or other_value == value:
                    continue
                key = (round_number, topic, left.agent_name, right.agent_name)
                if key in seen:
                    continue
                if OPPOSING_VALUES.get(topic, {}).get(value) == other_value or left.stance != right.stance:
                    conflict_type, impact = self._classify_conflict(left.agent_name, right.agent_name, topic)
                    conflicts.append(
                        ConflictRecord(
                            round=round_number,
                            topic=topic,
                            agents=[left.agent_name, right.agent_name],
                            opposing_agents=[left.agent_name, right.agent_name],
                            description=f"{left.agent_name} recommends {topic}={value} while {right.agent_name} recommends {topic}={other_value}.",
                            severity=4 if impact == "High" else 3,
                            conflict_type=conflict_type,
                            impact=impact,
                        )
                    )
                    seen.add(key)

        return conflicts[:12]

    def _classify_conflict(self, left: str, right: str, topic: str) -> Tuple[str, str]:
        key = frozenset({left, right})
        if key in CONFLICT_CLASSIFICATIONS:
            return CONFLICT_CLASSIFICATIONS[key]
        if topic == "pricing":
            return ("Pricing strategy disagreement", "Medium")
        if topic == "scope":
            return ("Scope and sequencing disagreement", "Medium")
        if topic == "board stance":
            return ("Executive recommendation split", "Medium")
        return ("General disagreement", "Low")
