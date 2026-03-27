from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from backend.controller.schemas import AgentDefinition, AgentTurn, AnalyzeRequest


@dataclass
class AgentProfile:
    definition: AgentDefinition
    bias: float
    weight: float
    default_challenge_targets: List[str]


class Agent:
    def __init__(self, profile: AgentProfile, reasoner: "StrategicReasoner") -> None:
        self.profile = profile
        self.reasoner = reasoner

    def respond(
        self,
        request: AnalyzeRequest,
        round_number: int,
        full_history: List[AgentTurn],
        round_summaries: List["RoundSummary"],
        conflict_brief: List["ConflictRecord"],
        agent_memory: Dict[str, object],
    ) -> AgentTurn:
        return self.reasoner.generate_turn(
            profile=self.profile,
            request=request,
            round_number=round_number,
            full_history=full_history,
            round_summaries=round_summaries,
            conflicts=conflict_brief,
            agent_memory=agent_memory,
        )
