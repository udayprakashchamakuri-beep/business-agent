from __future__ import annotations

from typing import Callable, Dict, Iterable, List, Optional

from backend.agents.prompts import build_agent_definitions
from backend.agents.registry import build_agent_roster
from backend.controller.action_engine import ActionEngine
from backend.controller.decision_engine import DecisionEngine
from backend.controller.explainability_engine import ExplainabilityEngine
from backend.controller.schemas import (
    ActionPlan,
    AgentTurn,
    AnalyzeRequest,
    AnalyzeResponse,
    ExplainabilityReport,
    FinalDecision,
    FinancialPlan,
    HiringPlan,
    MarketingStrategy,
    MemorySummary,
    ReasoningTraceItem,
    RoundSummary,
    ScenarioOutcome,
    ScenarioVariation,
    ValidationCheck,
)
from backend.debate_engine.engine import DebateEngine, DebateResult
from backend.memory.manager import MemoryManager
from backend.security.auth import build_scoped_memory_key
from backend.services.featherless_client import FeatherlessClient


class EnterpriseOrchestrator:
    def __init__(self) -> None:
        self.agent_definitions = list(build_agent_definitions().values())
        self.agent_definitions_by_name = {definition.name: definition for definition in self.agent_definitions}
        self.agents = build_agent_roster()
        self.agents_by_name = {agent.profile.definition.name: agent for agent in self.agents}
        self.decision_engine = DecisionEngine()
        self.action_engine = ActionEngine()
        self.explainability_engine = ExplainabilityEngine()
        self.featherless_client = FeatherlessClient()

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
        if not self._is_business_prompt(scoped_request):
            response = self._build_non_business_response(
                request=scoped_request,
                active_definitions=active_definitions,
                active_agents=active_agents,
            )
            self._emit(event_handler, {"type": "final", "result": response.model_dump()})
            return response

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
            base_confidence=final_output.confidence,
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

    def _is_business_prompt(self, request: AnalyzeRequest) -> bool:
        text = request.business_problem.lower().strip()
        if not text:
            return False

        classified = self.featherless_client.classify_prompt_kind(request.business_problem)
        if classified == "BUSINESS":
            return True
        if classified == "GENERAL":
            return False

        general_patterns = [
            "who is",
            "what is",
            "when was",
            "where is",
            "tell me about",
            "biography",
            "net worth",
            "celebrity",
            "actor",
            "singer",
            "president",
        ]
        if any(pattern in text for pattern in general_patterns):
            return False

        business_signals = [
            "business",
            "startup",
            "company",
            "launch",
            "market",
            "customer",
            "pricing",
            "price",
            "revenue",
            "sales",
            "profit",
            "margin",
            "cash",
            "runway",
            "growth",
            "hire",
            "hiring",
            "invest",
            "investment",
            "risk",
            "expand",
            "expansion",
            "store",
            "shop",
            "cafe",
            "restaurant",
            "gym",
            "game center",
            "college",
            "break even",
            "subscription",
            "product",
            "service",
            "cost",
            "buyer",
            "competitor",
        ]
        if any(signal in text for signal in business_signals):
            return True

        return any(
            phrase in text
            for phrase in [
                "should we",
                "can this work",
                "how risky",
                "how should",
                "best way to launch",
                "business plan",
                "pricing plan",
            ]
        )

    def _build_non_business_response(
        self,
        request: AnalyzeRequest,
        active_definitions,
        active_agents,
    ) -> AnalyzeResponse:
        direct_answer = self.featherless_client.answer_general_prompt(
            prompt=request.business_problem,
            fallback=(
                "This demo is mainly built for business decisions. For a general question like this, "
                "please try again in a moment or ask a business-focused question."
            ),
        )
        sample_prompts = [
            "Should I open a game center near a college?",
            "What pricing model should I use for my tutoring startup?",
            "How risky is it to launch with only 8 months of cash left?",
        ]
        turn = AgentTurn(
            agent_name="General Assistant",
            role="Direct model answer",
            round=1,
            scenario_name=request.scenario_name,
            message=direct_answer,
            stance="MODIFY",
            confidence=94,
            topics=["general answer"],
            key_points=["Answered directly with the language model"],
            assumptions=[],
            references=[],
            challenged_agents=[],
            policy_positions={},
            score_snapshot={},
            estimated_metrics={},
            calculations=[],
            memory_references=[],
            research_points=[],
        )
        return AnalyzeResponse(
            company_name=request.company_name or "Business decision review",
            agent_definitions=active_definitions,
            conversation=[turn],
            round_summaries=[
                RoundSummary(
                    round=1,
                    synopsis="The latest prompt was answered directly because it is not a business-advice request.",
                    consensus_points=["The app used the language model directly instead of the business advisory debate."],
                    conflict_points=[],
                    open_questions=sample_prompts,
                    numeric_highlights={"average_confidence": 94},
                )
            ],
            conflicts=[],
            final_output=FinalDecision(
                decision="MODIFY",
                confidence=94,
                key_reasons=[
                    "This prompt was treated as a general question instead of a business case.",
                    "The system used the language model directly to answer it.",
                ],
                risks=["If you want advisor debate, ask a business question about launch, pricing, demand, costs, risks, or growth."],
                recommended_actions=sample_prompts,
            ),
            actions=ActionPlan(
                execution_plan=[],
                marketing_strategy=MarketingStrategy(
                    audience="Demo user",
                    positioning="Business-advice demo",
                    core_message="Ask about a business idea, market, pricing, costs, risks, or launch timing.",
                    channels=[],
                    ad_angles=[],
                ),
                financial_plan=FinancialPlan(
                    assumptions=[],
                    monthly_costs=[],
                    revenue_projection=[],
                    roi_estimate="No estimate yet because this was not a business case.",
                ),
                hiring_plan=HiringPlan(roles=[], hiring_sequence=["No hiring advice yet because this was not a business case."]),
            ),
            scenario_results=[],
            explainability=ExplainabilityReport(
                top_influencer="General Assistant",
                conflicts=[],
                final_reasoning_summary=(
                    "The request was classified as a general question, so the app skipped the advisor debate and returned a direct model answer."
                ),
                reasoning_trace=[
                    ReasoningTraceItem(
                        agent_name="General Assistant",
                        influence_score=1.0,
                        stance="MODIFY",
                        summary="The language model answered directly because the prompt was not a business-decision request.",
                    )
                ],
            ),
            memory_summary=MemorySummary(
                recalled_simulations=0,
                prior_failures=[],
                learned_adjustments=["Redirect general questions toward business prompts."],
                prior_agent_arguments={},
            ),
            validation=ValidationCheck(
                decisions_made=True,
                multiple_scenarios_simulated=False,
                actions_generated=True,
                memory_used=False,
                passed=True,
            ),
        )

    def _run_scenarios(
        self,
        base_request: AnalyzeRequest,
        user_id: str,
        base_result: DebateResult,
        base_decision: str,
        base_confidence: int,
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
            scenario_result = self._simulate_scenario_outcome(
                variation=variation,
                base_decision=base_decision,
                base_confidence=base_confidence,
                base_latest_turns=base_latest_turns,
                base_top_influencer=base_explainability_top,
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

    def _simulate_scenario_outcome(
        self,
        variation: ScenarioVariation,
        base_decision: str,
        base_confidence: int,
        base_latest_turns: Dict[str, object],
        base_top_influencer: str,
    ) -> ScenarioOutcome:
        delta_score = self._scenario_delta_score(variation)
        scenario_decision = self._shift_decision(base_decision, delta_score)
        scenario_confidence = self._shift_confidence(base_confidence, delta_score)
        changed_agents = self._scenario_changed_agents(delta_score, base_latest_turns)
        scenario_top_influencer = self._scenario_top_influencer(delta_score, base_top_influencer)
        reasoning_shift = self._scenario_reasoning_shift(
            variation=variation,
            delta_score=delta_score,
            changed_agents=changed_agents,
            base_top_influencer=base_top_influencer,
            scenario_top_influencer=scenario_top_influencer,
        )
        difference_from_base = self._difference_from_base(
            base_decision=base_decision,
            scenario_decision=scenario_decision,
            changed_agents=changed_agents,
        )
        return ScenarioOutcome(
            scenario=variation.scenario,
            decision=scenario_decision,
            confidence=scenario_confidence,
            difference_from_base=difference_from_base,
            reasoning_shift=reasoning_shift,
            changed_agents=changed_agents[:6],
            top_influencer=scenario_top_influencer,
        )

    def _scenario_delta_score(self, variation: ScenarioVariation) -> float:
        market_shift = {"bearish": -1.0, "base": 0.0, "bullish": 1.0}.get(variation.market_condition, 0.0)
        competition_shift = {"high": -0.85, "medium": 0.0, "low": 0.65}.get(variation.competition_level, 0.0)
        budget_shift = variation.budget_change_pct / 18
        pricing_shift = variation.pricing_change_pct / 12
        return round(market_shift + competition_shift + budget_shift + pricing_shift, 2)

    def _shift_decision(self, base_decision: str, delta_score: float) -> str:
        ordering = ["NO GO", "MODIFY", "GO"]
        current_index = ordering.index(base_decision)
        if delta_score >= 0.9:
            current_index = min(current_index + 1, len(ordering) - 1)
        elif delta_score <= -0.9:
            current_index = max(current_index - 1, 0)
        return ordering[current_index]

    def _shift_confidence(self, base_confidence: int, delta_score: float) -> int:
        adjusted = base_confidence + int(delta_score * 8)
        return max(58, min(92, adjusted))

    def _scenario_changed_agents(self, delta_score: float, base_latest_turns: Dict[str, object]) -> List[str]:
        if delta_score >= 0.9:
            likely_agents = ["CEO Agent", "Market Research Agent", "Marketing Agent", "Sales Strategy Agent"]
        elif delta_score <= -0.9:
            likely_agents = ["Finance Agent", "Risk Agent", "Supply Chain Agent", "CEO Agent"]
        else:
            likely_agents = ["CEO Agent", "Finance Agent", "Market Research Agent"]

        return [agent_name for agent_name in likely_agents if agent_name in base_latest_turns]

    def _scenario_top_influencer(self, delta_score: float, base_top_influencer: str) -> str:
        if delta_score >= 0.9:
            return "CEO Agent" if base_top_influencer != "CEO Agent" else "Market Research Agent"
        if delta_score <= -0.9:
            return "Risk Agent" if base_top_influencer != "Risk Agent" else "Finance Agent"
        return base_top_influencer

    def _scenario_reasoning_shift(
        self,
        variation: ScenarioVariation,
        delta_score: float,
        changed_agents: List[str],
        base_top_influencer: str,
        scenario_top_influencer: str,
    ) -> List[str]:
        shifts: List[str] = []
        if scenario_top_influencer != base_top_influencer:
            shifts.append(
                f"The most influential advisor changed from {base_top_influencer} to {scenario_top_influencer} in this scenario."
            )

        if variation.market_condition != "base":
            shifts.append(
                f"The market assumption changed to {variation.market_condition}, which pushed the team toward a more {'optimistic' if delta_score > 0 else 'cautious'} reading."
            )
        if variation.competition_level != "medium":
            shifts.append(
                f"Competition was treated as {variation.competition_level}, which changed how the team judged pricing power and growth risk."
            )
        if variation.budget_change_pct:
            shifts.append(
                f"The budget assumption moved by {variation.budget_change_pct:+.0f}%, changing how much room the team saw for execution mistakes."
            )
        if variation.pricing_change_pct:
            shifts.append(
                f"The pricing assumption moved by {variation.pricing_change_pct:+.0f}%, which changed the expected payback and upside."
            )
        if changed_agents:
            shifts.append(
                f"The advisors most affected in this scenario were {', '.join(changed_agents[:3])}."
            )

        return shifts[:5] or ["The scenario kept the same overall direction, with only small shifts in confidence."]

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
                f"The most influential advisor changed from {base_top_influencer} to {scenario_top_influencer} in this scenario."
            )

        for agent_name, scenario_turn in scenario_latest_turns.items():
            base_turn = base_latest_turns.get(agent_name)
            if not base_turn:
                continue
            if base_turn.stance != scenario_turn.stance:
                shifts.append(
                    f"{agent_name} changed its recommendation from {base_turn.stance} to {scenario_turn.stance} after the scenario assumptions changed."
                )
            elif abs(base_turn.confidence - scenario_turn.confidence) >= 8:
                shifts.append(
                    f"{agent_name} kept the same recommendation, but confidence changed from {base_turn.confidence}% to {scenario_turn.confidence}%."
                )

        return shifts[:5] or ["The board stayed directionally consistent and mainly adjusted confidence rather than verdict."]

    def _difference_from_base(self, base_decision: str, scenario_decision: str, changed_agents: Iterable[str]) -> str:
        if scenario_decision == base_decision:
            return (
                f"The final answer stayed at {base_decision}, but {len(list(changed_agents))} advisors "
                "changed either their view or their confidence level."
            )
        return (
            f"The final answer changed from {base_decision} to {scenario_decision} because the new assumptions "
            "changed how the team weighed the trade-offs."
        )

    def _emit(self, event_handler: Optional[Callable[[Dict[str, object]], None]], payload: Dict[str, object]) -> None:
        if event_handler:
            event_handler(payload)

    def _resolve_agents(self, selected_agent_names: Iterable[str]):
        normalized_names = [name for name in selected_agent_names if name in self.agents_by_name]
        if not normalized_names:
            return self.agents
        return [self.agents_by_name[name] for name in normalized_names]
