from __future__ import annotations

from itertools import combinations
from typing import Dict, List, Tuple

from backend.controller.schemas import AgentTurn, ConflictRecord


OPPOSING_VALUES: Dict[str, Dict[str, str]] = {
    "pace": {"aggressive": "cautious", "cautious": "aggressive"},
    "scope": {"narrow": "broad", "broad": "narrow"},
    "pricing": {"value-forward": "margin-protective", "margin-protective": "value-forward"},
    "risk_posture": {"control-first": "accept", "accept": "control-first"},
    "channel": {"quality-over-volume": "diversified", "diversified": "quality-over-volume"},
}


class ConflictDetector:
    def detect(self, round_number: int, turns: List[AgentTurn]) -> List[ConflictRecord]:
        conflicts: List[ConflictRecord] = []
        seen: set[Tuple[int, str, str, str]] = set()

        for left, right in combinations(turns, 2):
            if left.stance != right.stance:
                key = (round_number, "board stance", left.agent_name, right.agent_name)
                if key not in seen:
                    conflicts.append(
                        ConflictRecord(
                            round=round_number,
                            topic="board stance",
                            agents=[left.agent_name, right.agent_name],
                            description=(
                                f"{left.agent_name} is {left.stance} while {right.agent_name} is {right.stance}, "
                                "showing a direct recommendation split."
                            ),
                            severity=min(5, 2 + abs(left.confidence - right.confidence) // 20),
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
                    conflicts.append(
                        ConflictRecord(
                            round=round_number,
                            topic=topic,
                            agents=[left.agent_name, right.agent_name],
                            description=f"{left.agent_name} recommends {topic}={value} while {right.agent_name} recommends {topic}={other_value}.",
                            severity=3,
                        )
                    )
                    seen.add(key)

        return conflicts[:12]
