from __future__ import annotations

from backend.agents.prompts import build_agent_definitions
from backend.agents.registry import build_agent_roster
from backend.controller.decision_engine import DecisionEngine
from backend.controller.schemas import AnalyzeRequest, AnalyzeResponse
from backend.debate_engine.engine import DebateEngine
from backend.memory.manager import MemoryManager


class EnterpriseOrchestrator:
    def __init__(self) -> None:
        self.agent_definitions = list(build_agent_definitions().values())
        self.agents = build_agent_roster()
        self.decision_engine = DecisionEngine()

    def analyze(self, request: AnalyzeRequest) -> AnalyzeResponse:
        memory = MemoryManager()
        debate_engine = DebateEngine(agents=self.agents, memory=memory)
        debate_result = debate_engine.run(request)
        final_output = self.decision_engine.decide(
            agents=self.agents,
            conversation=debate_result.conversation,
            round_summaries=debate_result.round_summaries,
            conflicts=debate_result.conflicts,
        )
        return AnalyzeResponse(
            company_name=request.company_name,
            agent_definitions=self.agent_definitions,
            conversation=debate_result.conversation,
            round_summaries=debate_result.round_summaries,
            conflicts=debate_result.conflicts,
            final_output=final_output,
        )
