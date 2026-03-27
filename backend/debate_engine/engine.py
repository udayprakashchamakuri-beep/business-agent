from __future__ import annotations

from dataclasses import dataclass
from typing import List

from backend.agents.base import Agent
from backend.controller.schemas import AgentTurn, AnalyzeRequest, ConflictRecord, RoundSummary
from backend.debate_engine.conflict_detector import ConflictDetector
from backend.memory.manager import MemoryManager


@dataclass
class DebateResult:
    conversation: List[AgentTurn]
    round_summaries: List[RoundSummary]
    conflicts: List[ConflictRecord]


class DebateEngine:
    def __init__(self, agents: List[Agent], memory: MemoryManager) -> None:
        self.agents = agents
        self.memory = memory
        self.conflict_detector = ConflictDetector()

    def run(self, request: AnalyzeRequest) -> DebateResult:
        all_conflicts: List[ConflictRecord] = []

        for round_number in range(1, 4):
            round_turns: List[AgentTurn] = []
            for agent in self.agents:
                turn = agent.respond(
                    request=request,
                    round_number=round_number,
                    full_history=self.memory.global_history,
                    round_summaries=self.memory.round_summaries,
                    conflict_brief=all_conflicts,
                    agent_memory=self.memory.get_agent_memory(agent.profile.definition.name),
                )
                self.memory.record_turn(turn)
                round_turns.append(turn)

            round_conflicts = self.conflict_detector.detect(round_number=round_number, turns=round_turns)
            all_conflicts.extend(round_conflicts)
            self.memory.summarize_round(round_number=round_number, turns=round_turns, conflicts=all_conflicts)

        return DebateResult(
            conversation=self.memory.global_history,
            round_summaries=self.memory.round_summaries,
            conflicts=all_conflicts,
        )
