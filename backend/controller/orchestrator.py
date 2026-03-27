from __future__ import annotations

from typing import Callable, Dict, Iterable, List, Optional

from backend.agents.prompts import build_agent_definitions
from backend.agents.registry import build_agent_roster
from backend.controller.action_engine import ActionEngine
from backend.controller.decision_engine import DecisionEngine
from backend.controller.explainability_engine import ExplainabilityEngine
from backend.controller.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    ScenarioOutcome,
    ScenarioVariation,
    ValidationCheck,
)
from backend.debate_engine.engine import DebateEngine, DebateResult
from backend.memory.manager import MemoryManager
from backend.security.auth import build_scoped_memory_key


class EnterpriseOrchestrator:
    def __init__(self) -> None:
        self.agent_definitions = list(build_agent_definitions().values())
        self.agent_definitions_by_name = {definition.name: definition for definition in self.agent_definitions}
        self.agents = build_agent_roster()
        self.agents_by_name = {agent.profile.definition.name: agent for agent in self.agents}
        self.decision_engine = DecisionEngine()
        self.action_engine = ActionEngine()
        self.explainability_engine = ExplainabilityEngine()

    def analyze(self, request: AnalyzeRequest, user_id: str) -> AnalyzeResponse:
        return self._run_analysis(request=request, user_id=user_id)

    def stream_analyze(
        self,
        request: AnalyzeRequest,
        user_id: str,
        event_handler: Callable[[Dict[str, object]], None],
    ) -> AnalyzeResponse:
        return self._run_analysis(request=request, user_id=user_id, event_handler=event_handler)

    def _run_analysis(
        self,
        request: AnalyzeRequest,
        user_id: str,
        event_handler: Optional[Callable[[Dict[str, object]], None]] = None,
    ) -> AnalyzeResponse:
        scoped_request = request.model_copy(deep=True)
        scoped_request.memory_key = build_scoped_memory_key(
            user_id=user_id,
            company_name=scoped_request.company_name,
            requested_memory_key=scoped_request.memory_key,
        )
        self._emit(event_handler, {"type": "analysis_started", "company_name": request.company_name})

        active_agents = self._resolve_agents(scoped_request.selected_agent_names)
        active_definitions = [agent.profile.definition for agent in active_agents]
        memory = MemoryManager(scoped_request, user_id=user_id)
        debate_engine = DebateEngine(agents=active_agents, memory=memory)
        debate_result = debate_engine.run(
            scoped_request,
            event_handler=event_handler,
        )
        final_output = self.decision_engine.decide(
            agents=active_agents,
            conversation=debate_result.conversation,
            round_summaries=debate_result.round_summaries,
            conflicts=debate_result.conflicts,
        )
        latest_turns = self._latest_turns(debate_result.conversation)
        explainability = self.explainability_engine.build(
            agents=active_agents,
            conversation=debate_result.conversation,
            conflicts=debate_result.conflicts,
            final_decision=final_output.decision,
        )
        actions = self.action_engine.build(
            request=scoped_request,
            final_decision=final_output.decision,
            latest_turns=latest_turns,
        )
        memory_summary = memory.build_memory_summary()

        self._emit(
            event_handler,
            {
                "type": "base_decision",
                "final_output": final_output.model_dump(),
                "actions": actions.model_dump(),
                "explainability": explainability.model_dump(),
                "memory_summary": memory_summary.model_dump(),
            },
        )

        scenario_results = self._run_scenarios(
            base_request=request,
            user_id=user_id,
            base_result=debate_result,
            base_decision=final_output.decision,
            base_explainability_top=explainability.top_influencer,
            active_agents=active_agents,
            event_handler=event_handler,
        )
        validation = self._build_validation(
            conversation=debate_result.conversation,
            scenario_results=scenario_results,
            actions=actions,
            memory=memory,
            memory_summary=memory_summary,
        )

        response = AnalyzeResponse(
            company_name=request.company_name,
            agent_definitions=active_definitions,
            conversation=debate_result.conversation,
            round_summaries=debate_result.round_summaries,
            conflicts=debate_result.conflicts,
            final_output=final_output,
            actions=actions,
            scenario_results=scenario_results,
            explainability=explainability,
            memory_summary=memory_summary,
            validation=validation,
        )

        memory.record_simulation(
            request=scoped_request,
            final_output=final_output,
            explainability=explainability,
            conversation=debate_result.conversation,
        )

        self._emit(event_handler, {"type": "final", "result": response.model_dump()})
        return response

    def _run_scenarios(
        self,
        base_request: AnalyzeRequest,
        user_id: str,
        base_result: DebateResult,
        base_decision: str,
        base_explainability_top: str,
        active_agents,
        event_handler: Optional[Callable[[Dict[str, object]], None]] = None,
    ) -> List[ScenarioOutcome]:
        scenario_results: List[ScenarioOutcome] = []
        variations = base_request.scenario_variations or self._default_variations()
        base_latest_turns = self._latest_turns(base_result.conversation)

        for variation in variations:
            scenario_request = self._apply_variation(base_request, variation)
            scenario_request.memory_key = build_scoped_memory_key(
                user_id=user_id,
                company_name=scenario_request.company_name,
                requested_memory_key=scenario_request.memory_key,
            )
            self._emit(
                event_handler,
                {
                    "type": "scenario_started",
                    "scenario": scenario_request.scenario_name,
                    "variation": variation.model_dump(),
                },
            )
            memory = MemoryManager(scenario_request, user_id=user_id)
            debate_engine = DebateEngine(agents=active_agents, memory=memory)
            scenario_debate = debate_engine.run(scenario_request)
            scenario_final = self.decision_engine.decide(
                agents=active_agents,
                conversation=scenario_debate.conversation,
                round_summaries=scenario_debate.round_summaries,
                conflicts=scenario_debate.conflicts,
            )
            scenario_explainability = self.explainability_engine.build(
                agents=active_agents,
                conversation=scenario_debate.conversation,
                conflicts=scenario_debate.conflicts,
                final_decision=scenario_final.decision,
            )
            scenario_latest_turns = self._latest_turns(scenario_debate.conversation)
            changed_agents = [
                agent_name
                for agent_name, turn in scenario_latest_turns.items()
                if base_latest_turns.get(agent_name)
                and (
                    base_latest_turns[agent_name].stance != turn.stance
                    or abs(base_latest_turns[agent_name].confidence - turn.confidence) >= 8
                )
            ]
            reasoning_shift = self._build_reasoning_shift(
                base_latest_turns=base_latest_turns,
                scenario_latest_turns=scenario_latest_turns,
                base_top_influencer=base_explainability_top,
                scenario_top_influencer=scenario_explainability.top_influencer,
            )
            difference_from_base = self._difference_from_base(
                base_decision=base_decision,
                scenario_decision=scenario_final.decision,
                changed_agents=changed_agents,
            )
            scenario_result = ScenarioOutcome(
                scenario=scenario_request.scenario_name,
                decision=scenario_final.decision,
                confidence=scenario_final.confidence,
                difference_from_base=difference_from_base,
                reasoning_shift=reasoning_shift,
                changed_agents=changed_agents[:6],
                top_influencer=scenario_explainability.top_influencer,
            )
            scenario_results.append(scenario_result)
            self._emit(
                event_handler,
                {
                    "type": "scenario_complete",
                    "scenario_result": scenario_result.model_dump(),
                },
            )

        return scenario_results

    def _build_validation(
        self,
        conversation,
        scenario_results,
        actions,
        memory: MemoryManager,
        memory_summary,
    ) -> ValidationCheck:
        memory_used = bool(
            memory.round_summaries
            and (
                memory_summary.recalled_simulations >= 0
                or any(turn.memory_references for turn in conversation)
            )
        )
        return ValidationCheck(
            decisions_made=bool(conversation),
            multiple_scenarios_simulated=len(scenario_results) >= 2,
            actions_generated=bool(
                actions.execution_plan and actions.marketing_strategy.channels and actions.hiring_plan.roles
            ),
            memory_used=memory_used,
            passed=all(
                [
                    bool(conversation),
                    len(scenario_results) >= 2,
                    bool(actions.execution_plan and actions.marketing_strategy.channels and actions.hiring_plan.roles),
                    memory_used,
                ]
            ),
        )

    def _apply_variation(self, base_request: AnalyzeRequest, variation: ScenarioVariation) -> AnalyzeRequest:
        scenario_request = base_request.model_copy(deep=True)
        scenario_request.scenario_name = variation.scenario

        runway = float(scenario_request.known_metrics.get("runway_months", 12) or 12)
        price_point = float(scenario_request.known_metrics.get("price_point", 10000) or 10000)
        scenario_request.known_metrics["runway_months"] = round(runway * (1 + variation.budget_change_pct / 100), 2)
        scenario_request.known_metrics["price_point"] = round(price_point * (1 + variation.pricing_change_pct / 100), 2)
        scenario_request.known_metrics["scenario_budget_change_pct"] = variation.budget_change_pct
        scenario_request.known_metrics["scenario_market_condition"] = variation.market_condition
        scenario_request.known_metrics["scenario_competition_level"] = variation.competition_level
        scenario_request.known_metrics["scenario_pricing_change_pct"] = variation.pricing_change_pct
        scenario_request.current_constraints = list(base_request.current_constraints) + [
            f"Scenario market condition: {variation.market_condition}",
            f"Scenario competition level: {variation.competition_level}",
            f"Budget change: {variation.budget_change_pct:+.0f}%",
            f"Pricing change: {variation.pricing_change_pct:+.0f}%",
        ]
        if variation.notes:
            scenario_request.current_constraints.append(variation.notes)
        return scenario_request

    def _default_variations(self) -> List[ScenarioVariation]:
        return [
            ScenarioVariation(
                scenario="Lean Budget Stress Test",
                budget_change_pct=-20,
                market_condition="bearish",
                competition_level="high",
                pricing_change_pct=-10,
                notes="Stress-test whether the plan survives tighter budget and higher competition.",
            ),
            ScenarioVariation(
                scenario="Demand Expansion Upside",
                budget_change_pct=10,
                market_condition="bullish",
                competition_level="low",
                pricing_change_pct=5,
                notes="Simulate a stronger market with slightly improved pricing leverage.",
            ),
        ]

    def _latest_turns(self, conversation) -> Dict[str, object]:
        latest_turns: Dict[str, object] = {}
        for turn in conversation:
            latest_turns[turn.agent_name] = turn
        return latest_turns

    def _build_reasoning_shift(
        self,
        base_latest_turns,
        scenario_latest_turns,
        base_top_influencer: str,
        scenario_top_influencer: str,
    ) -> List[str]:
        shifts: List[str] = []
        if base_top_influencer != scenario_top_influencer:
            shifts.append(
                f"Top influence shifted from {base_top_influencer} to {scenario_top_influencer} under the new assumptions."
            )

        for agent_name, scenario_turn in scenario_latest_turns.items():
            base_turn = base_latest_turns.get(agent_name)
            if not base_turn:
                continue
            if base_turn.stance != scenario_turn.stance:
                shifts.append(
                    f"{agent_name} moved from {base_turn.stance} to {scenario_turn.stance} after the scenario assumptions changed."
                )
            elif abs(base_turn.confidence - scenario_turn.confidence) >= 8:
                shifts.append(
                    f"{agent_name} kept the same stance but confidence moved from {base_turn.confidence}% to {scenario_turn.confidence}%."
                )

        return shifts[:5] or ["The board stayed directionally consistent and mainly adjusted confidence rather than verdict."]

    def _difference_from_base(self, base_decision: str, scenario_decision: str, changed_agents: Iterable[str]) -> str:
        if scenario_decision == base_decision:
            return f"Decision stayed at {base_decision}, but {len(list(changed_agents))} agents materially changed stance or confidence."
        return f"Decision shifted from {base_decision} to {scenario_decision} because the altered assumptions changed board weighting."

    def _emit(self, event_handler: Optional[Callable[[Dict[str, object]], None]], payload: Dict[str, object]) -> None:
        if event_handler:
            event_handler(payload)

    def _resolve_agents(self, selected_agent_names: Iterable[str]):
        normalized_names = [name for name in selected_agent_names if name in self.agents_by_name]
        if not normalized_names:
            return self.agents
        return [self.agents_by_name[name] for name in normalized_names]
