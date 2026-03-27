from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from statistics import mean
from typing import Dict, Iterable, List, Tuple

from backend.agents.base import AgentProfile
from backend.controller.schemas import AgentTurn, AnalyzeRequest, ConflictRecord, DecisionStatus, RoundSummary
from backend.services.brightdata_client import BrightDataClient, BrightDataResearch
from backend.services.featherless_client import FeatherlessClient


@dataclass
class Insight:
    topic: str
    text: str
    score: float
    action: str
    assumption: str
    positions: Dict[str, str] = field(default_factory=dict)


@dataclass
class BusinessSignals:
    channel: str
    business_model: str
    market_attractiveness: int
    growth_potential: int
    financial_viability: int
    operational_complexity: int
    compliance_risk: int
    talent_load: int
    pricing_power: int
    sales_friction: int
    differentiation_pressure: int
    numeric_metrics: Dict[str, float]
    derived_metrics: Dict[str, float]
    evidence: List[str]
    external_research: BrightDataResearch = field(default_factory=BrightDataResearch)

    def snapshot(self) -> Dict[str, int]:
        return {
            "market_attractiveness": self.market_attractiveness,
            "growth_potential": self.growth_potential,
            "financial_viability": self.financial_viability,
            "operational_complexity": self.operational_complexity,
            "compliance_risk": self.compliance_risk,
            "talent_load": self.talent_load,
            "pricing_power": self.pricing_power,
            "sales_friction": self.sales_friction,
            "differentiation_pressure": self.differentiation_pressure,
        }


class StrategicReasoner:
    def __init__(self) -> None:
        self.signal_cache: Dict[str, BusinessSignals] = {}
        self.featherless_client = FeatherlessClient()
        self.brightdata_client = BrightDataClient()

    def analyze_request(self, request: AnalyzeRequest) -> BusinessSignals:
        cache_key = json.dumps(request.model_dump(mode="json"), sort_keys=True)
        if cache_key in self.signal_cache:
            return self.signal_cache[cache_key]

        problem = " ".join(
            [
                request.business_problem,
                request.scenario_name,
                request.company_name,
                request.industry or "",
                request.region or "",
                " ".join(request.objectives),
                " ".join(request.current_constraints),
                " ".join(f"{k} {v}" for k, v in request.known_metrics.items()),
            ]
        ).lower()

        numeric_metrics = self._extract_numeric_metrics(problem, request.known_metrics)
        channel = self._detect_channel(problem)
        business_model = self._detect_business_model(problem)
        external_research = self._fetch_external_research(request)

        market_attractiveness = 50
        growth_potential = 50
        financial_viability = 50
        operational_complexity = 45
        compliance_risk = 30
        talent_load = 45
        pricing_power = 50
        sales_friction = 50
        differentiation_pressure = 50
        evidence: List[str] = []

        for keyword in ["waitlist", "underserved", "expanding", "growing", "urgent", "painful", "retention"]:
            if keyword in problem:
                market_attractiveness += 6
                evidence.append(f"Demand cue detected: {keyword}.")
        for keyword in ["crowded", "commoditized", "saturated", "weak demand", "unclear buyer"]:
            if keyword in problem:
                market_attractiveness -= 7
                differentiation_pressure += 5
                evidence.append(f"Competitive pressure cue detected: {keyword}.")

        if channel == "B2B":
            pricing_power += 10
            sales_friction += 12
            evidence.append("B2B motion inferred, improving pricing power but lengthening the sales cycle.")
        elif channel == "B2C":
            growth_potential += 8
            pricing_power -= 5
            evidence.append("B2C motion inferred, improving scale potential but reducing pricing power.")

        if business_model in {"hardware", "marketplace"}:
            operational_complexity += 20
            financial_viability -= 8
            talent_load += 8
            evidence.append(f"{business_model.title()} model inferred, increasing operational complexity.")
        elif business_model in {"subscription", "software"}:
            financial_viability += 8
            growth_potential += 6
            evidence.append(f"{business_model.title()} model inferred, improving recurring revenue potential.")

        for keyword in ["healthcare", "fintech", "insurance", "payments", "compliance", "privacy", "regulated"]:
            if keyword in problem:
                compliance_risk += 10
                operational_complexity += 5
                evidence.append(f"Regulated-domain cue detected: {keyword}.")

        for keyword in ["inventory", "warehouse", "shipping", "vendor", "manufacturing", "logistics", "fulfillment"]:
            if keyword in problem:
                operational_complexity += 8
                evidence.append(f"Operational dependency detected: {keyword}.")

        for keyword in ["ai engineer", "ml engineer", "phd", "sales team", "enterprise rep", "specialist"]:
            if keyword in problem:
                talent_load += 8
                evidence.append(f"Talent intensity cue detected: {keyword}.")

        if "enterprise" in problem or "integration" in problem or "procurement" in problem:
            sales_friction += 12
            evidence.append("Enterprise buying complexity inferred.")
        if "self-serve" in problem or "plg" in problem or "online checkout" in problem:
            sales_friction -= 8
            growth_potential += 5
            evidence.append("Lower-friction purchase path inferred.")

        if any(word in problem for word in ["premium", "roi", "savings", "mission critical", "compliance cost"]):
            pricing_power += 10
            evidence.append("Value density cues suggest stronger willingness to pay.")
        if any(word in problem for word in ["discount", "cheap", "price sensitive", "consumer subscription"]):
            pricing_power -= 10
            evidence.append("Price sensitivity cues suggest weaker pricing power.")

        runway = numeric_metrics.get("runway_months")
        gross_margin = numeric_metrics.get("gross_margin")
        cac_payback = numeric_metrics.get("cac_payback_months")
        price_point = numeric_metrics.get("price_point")
        budget_change_pct = numeric_metrics.get("scenario_budget_change_pct", 0.0)
        market_condition = str(request.known_metrics.get("scenario_market_condition", "base")).lower()
        competition_level = str(request.known_metrics.get("scenario_competition_level", "medium")).lower()

        research_price_point = self._infer_price_point_from_research(external_research)
        if price_point is None and research_price_point is not None:
            numeric_metrics["price_point"] = research_price_point
            price_point = research_price_point
            evidence.append(
                f"Bright Data pricing scan suggests an entry price around ${research_price_point:,.0f} for similar offers."
            )

        if runway is not None:
            if runway >= 18:
                financial_viability += 15
                evidence.append(f"Runway of {runway:.0f} months supports experimentation.")
            elif runway <= 9:
                financial_viability -= 18
                evidence.append(f"Runway of {runway:.0f} months creates financing pressure.")

        if gross_margin is not None:
            if gross_margin >= 70:
                financial_viability += 12
                pricing_power += 6
                evidence.append(f"Gross margin at {gross_margin:.0f}% strengthens unit economics.")
            elif gross_margin <= 40:
                financial_viability -= 14
                evidence.append(f"Gross margin at {gross_margin:.0f}% materially weakens scale economics.")

        if cac_payback is not None:
            if cac_payback <= 12:
                financial_viability += 10
                evidence.append(f"CAC payback of {cac_payback:.0f} months is acceptable for scaling.")
            elif cac_payback > 18:
                financial_viability -= 12
                sales_friction += 6
                evidence.append(f"CAC payback of {cac_payback:.0f} months is slow for current stage.")

        if price_point is not None:
            if price_point >= 10000:
                pricing_power += 8
                sales_friction += 8
                evidence.append(f"High ticket size (${price_point:,.0f}) implies consultative selling.")
            elif price_point <= 100:
                pricing_power -= 6
                growth_potential += 5
                evidence.append(f"Low price point (${price_point:,.0f}) favors faster volume motion.")

        if budget_change_pct:
            if budget_change_pct <= -20:
                financial_viability -= 12
                growth_potential -= 5
                evidence.append(f"Budget is down {abs(budget_change_pct):.0f}%, tightening the operating envelope.")
            elif budget_change_pct < 0:
                financial_viability -= 6
                evidence.append(f"Budget is down {abs(budget_change_pct):.0f}%, reducing room for execution mistakes.")
            elif budget_change_pct >= 15:
                financial_viability += 6
                growth_potential += 4
                evidence.append(f"Budget is up {budget_change_pct:.0f}%, giving the board more room to sequence the plan.")

        if market_condition == "bearish":
            market_attractiveness -= 9
            growth_potential -= 7
            financial_viability -= 4
            evidence.append("Bearish market condition applied, lowering demand confidence and increasing caution.")
        elif market_condition == "bullish":
            market_attractiveness += 9
            growth_potential += 8
            pricing_power += 4
            evidence.append("Bullish market condition applied, improving demand and pricing confidence.")

        if competition_level == "high":
            differentiation_pressure += 14
            pricing_power -= 7
            sales_friction += 6
            evidence.append("High competition scenario applied, increasing differentiation and conversion pressure.")
        elif competition_level == "low":
            differentiation_pressure -= 8
            market_attractiveness += 4
            evidence.append("Low competition scenario applied, improving whitespace and buyer attention.")

        if request.company_stage.lower() in {"pre-seed", "seed"}:
            financial_viability -= 4
            talent_load += 4
        elif request.company_stage.lower() in {"series a", "series b", "growth"}:
            growth_potential += 6
            financial_viability += 4

        (
            market_attractiveness,
            growth_potential,
            financial_viability,
            operational_complexity,
            compliance_risk,
            pricing_power,
            sales_friction,
            differentiation_pressure,
            evidence,
        ) = self._apply_external_research(
            external_research=external_research,
            market_attractiveness=market_attractiveness,
            growth_potential=growth_potential,
            financial_viability=financial_viability,
            operational_complexity=operational_complexity,
            compliance_risk=compliance_risk,
            pricing_power=pricing_power,
            sales_friction=sales_friction,
            differentiation_pressure=differentiation_pressure,
            evidence=evidence,
        )

        market_attractiveness = self._clamp(market_attractiveness)
        growth_potential = self._clamp(growth_potential)
        financial_viability = self._clamp(financial_viability)
        operational_complexity = self._clamp(operational_complexity)
        compliance_risk = self._clamp(compliance_risk)
        talent_load = self._clamp(talent_load)
        pricing_power = self._clamp(pricing_power)
        sales_friction = self._clamp(sales_friction)
        differentiation_pressure = self._clamp(differentiation_pressure)

        derived_metrics = self._derive_metrics(
            request=request,
            channel=channel,
            market_attractiveness=market_attractiveness,
            growth_potential=growth_potential,
            financial_viability=financial_viability,
            operational_complexity=operational_complexity,
            compliance_risk=compliance_risk,
            pricing_power=pricing_power,
            sales_friction=sales_friction,
            differentiation_pressure=differentiation_pressure,
            numeric_metrics=numeric_metrics,
            external_research=external_research,
        )

        signals = BusinessSignals(
            channel=channel,
            business_model=business_model,
            market_attractiveness=market_attractiveness,
            growth_potential=growth_potential,
            financial_viability=financial_viability,
            operational_complexity=operational_complexity,
            compliance_risk=compliance_risk,
            talent_load=talent_load,
            pricing_power=pricing_power,
            sales_friction=sales_friction,
            differentiation_pressure=differentiation_pressure,
            numeric_metrics=numeric_metrics,
            derived_metrics=derived_metrics,
            evidence=evidence,
            external_research=external_research,
        )
        self.signal_cache[cache_key] = signals
        return signals

    def generate_turn(
        self,
        profile: AgentProfile,
        request: AnalyzeRequest,
        round_number: int,
        full_history: List[AgentTurn],
        round_summaries: List[RoundSummary],
        conflicts: List[ConflictRecord],
        agent_memory: Dict[str, object],
    ) -> AgentTurn:
        signals = self.analyze_request(request)
        latest_turns = self._latest_turns(full_history)
        insights = self._build_agent_insights(profile.definition.name, signals, request, latest_turns, conflicts)
        selected = self._select_insights(insights, agent_memory, round_number)
        stance_score = profile.bias + mean(item.score for item in selected)
        stance, confidence = self._score_to_stance(stance_score, round_number)
        reference_names, challenged_agents = self._pick_references(profile, full_history, latest_turns, conflicts)
        estimated_metrics = self._build_estimated_metrics(profile.definition.name, signals)
        calculations = self._build_calculations(profile.definition.name, estimated_metrics)
        memory_references = self._build_memory_references(agent_memory, request.scenario_name)
        research_points = self._build_research_points(profile.definition.name, signals.external_research)
        message = self._compose_message(
            profile=profile,
            selected=selected,
            stance=stance,
            confidence=confidence,
            round_number=round_number,
            reference_names=reference_names,
            challenged_agents=challenged_agents,
            round_summaries=round_summaries,
            estimated_metrics=estimated_metrics,
            calculations=calculations,
            memory_references=memory_references,
            research_points=research_points,
            scenario_name=request.scenario_name,
        )
        message = self._enhance_message_with_featherless(
            profile=profile,
            request=request,
            round_number=round_number,
            selected=selected,
            estimated_metrics=estimated_metrics,
            calculations=calculations,
            references=reference_names,
            memory_references=memory_references,
            fallback_message=message,
        )

        policy_positions: Dict[str, str] = {}
        assumptions: List[str] = []
        key_points: List[str] = []
        topics: List[str] = []
        for insight in selected:
            policy_positions.update(insight.positions)
            assumptions.append(insight.assumption)
            key_points.append(insight.action)
            topics.append(insight.topic)

        return AgentTurn(
            agent_name=profile.definition.name,
            role=profile.definition.role,
            round=round_number,
            scenario_name=request.scenario_name,
            message=message,
            stance=stance,
            confidence=confidence,
            topics=topics,
            key_points=key_points,
            assumptions=assumptions,
            references=reference_names,
            challenged_agents=challenged_agents,
            policy_positions=policy_positions,
            score_snapshot=signals.snapshot(),
            estimated_metrics=estimated_metrics,
            calculations=calculations,
            memory_references=memory_references,
            research_points=research_points,
        )

    def _build_agent_insights(
        self,
        agent_name: str,
        signals: BusinessSignals,
        request: AnalyzeRequest,
        latest_turns: Dict[str, AgentTurn],
        conflicts: List[ConflictRecord],
    ) -> List[Insight]:
        metrics = signals.numeric_metrics
        runway = metrics.get("runway_months", 12)
        gross_margin = metrics.get("gross_margin", max(35, signals.financial_viability))
        price_point = metrics.get("price_point", 499 if signals.channel == "B2C" else 12000)
        market = signals.market_attractiveness
        growth = signals.growth_potential
        finance = signals.financial_viability
        ops = signals.operational_complexity
        risk = signals.compliance_risk
        talent = signals.talent_load
        pricing = signals.pricing_power
        sales = signals.sales_friction
        diff = signals.differentiation_pressure
        top_conflict = conflicts[-1].topic if conflicts else "decision threshold"

        if agent_name == "CEO Agent":
            board_split = self._board_split(latest_turns.values())
            return [
                Insight(
                    topic="board_alignment",
                    text=(
                        f"The board is split at {board_split['go']} GO, {board_split['modify']} MODIFY, "
                        f"and {board_split['no_go']} NO GO positions, so we need sharper decision gates."
                    ),
                    score=(market + growth - risk - ops) / 250 - 0.1,
                    action="Translate disagreements into explicit launch conditions and milestones.",
                    assumption="Assuming current internal disagreement is a proxy for downstream execution friction.",
                    positions={"decision_gate": "milestone-based", "scope": "narrow"},
                ),
                Insight(
                    topic="tradeoff_balance",
                    text=(
                        f"Market attractiveness is {market}/100, but operational plus compliance burden is "
                        f"{round((ops + risk) / 2)}/100; the business case only works if we sequence risk down."
                    ),
                    score=(market - ((ops + risk) / 2)) / 100,
                    action="Force a staged plan rather than a full-commitment launch.",
                    assumption="Assuming sequencing can materially reduce risk without killing demand.",
                    positions={"pace": "balanced", "risk_posture": "mitigate"},
                ),
                Insight(
                    topic="open_conflict",
                    text=f"The loudest unresolved topic is {top_conflict}, and leaving it unresolved will weaken execution discipline.",
                    score=-0.05,
                    action="Assign a single owner and measurable threshold for the main unresolved conflict.",
                    assumption="Assuming unresolved executive conflict will slow execution after approval.",
                    positions={"governance": "single-owner"},
                ),
            ]

        if agent_name == "Startup Builder Agent":
            return [
                Insight(
                    topic="fast_wedge",
                    text=(
                        f"Market attractiveness is {market}/100 and growth potential is {growth}/100, "
                        "which is strong enough to justify a narrow wedge test."
                    ),
                    score=(market + growth - ops) / 220,
                    action="Launch a 90-day wedge focused on the sharpest buyer pain rather than a broad rollout.",
                    assumption="Assuming the team can isolate one ICP and one use case in the first phase.",
                    positions={"pace": "aggressive", "scope": "narrow"},
                ),
                Insight(
                    topic="ops_limit",
                    text=f"Operational complexity is {ops}/100, so speed only works if the first version stays asset-light.",
                    score=-(ops - 55) / 180,
                    action="Remove non-core operating steps from phase one and use partners where possible.",
                    assumption="Assuming partners can absorb early operational variance.",
                    positions={"operating_model": "partner-led"},
                ),
                Insight(
                    topic="builder_counterweight",
                    text=f"With runway estimated at {runway:.0f} months, we cannot spend multiple quarters studying the market without shipping.",
                    score=(runway - 10) / 60,
                    action="Commit to weekly learning milestones instead of waiting for perfect certainty.",
                    assumption="Assuming runway is the constraining clock if no faster feedback loop exists.",
                    positions={"decision_gate": "weekly-milestones"},
                ),
            ]

        if agent_name == "Market Research Agent":
            return [
                Insight(
                    topic="icp_clarity",
                    text=f"Differentiation pressure sits at {diff}/100; that means broad-market entry is dangerous without a sharply defined initial segment.",
                    score=(market - diff) / 180,
                    action="Select one priority segment and gather proof of urgency before widening the market.",
                    assumption="Assuming current problem framing does not yet prove a universal ICP.",
                    positions={"scope": "narrow", "gtm": "segment-led"},
                ),
                Insight(
                    topic="timing",
                    text=f"Demand looks moderate-to-strong at {market}/100, but buyer urgency only converts if the pain is immediate enough to survive prioritization cycles.",
                    score=(market - sales) / 200,
                    action="Test urgency with buyer interviews or design-partner commitments before scaling spend.",
                    assumption="Assuming stated pain may still lose to internal customer priorities.",
                    positions={"evidence_mode": "customer-validation"},
                ),
                Insight(
                    topic="channel_fit",
                    text=f"{signals.channel} motion and sales friction at {sales}/100 imply that reachability is not the same as closeability.",
                    score=(60 - sales) / 180,
                    action="Map the first segment to a realistic buying path instead of using TAM logic.",
                    assumption="Assuming the initial go-to-market path is still partially unproven.",
                    positions={"channel": "fit-before-scale"},
                ),
            ]

        if agent_name == "Finance Agent":
            return [
                Insight(
                    topic="runway_guardrail",
                    text=f"Financial viability is {finance}/100 with an estimated runway of {runway:.0f} months, which means capital discipline is not optional.",
                    score=(finance - 58) / 160,
                    action="Cap the first initiative behind stage gates tied to conversion and gross margin milestones.",
                    assumption="Assuming capital markets will stay rational rather than generous.",
                    positions={"pace": "cautious", "decision_gate": "economic-thresholds"},
                ),
                Insight(
                    topic="margin_quality",
                    text=f"Gross margin is modeled at {gross_margin:.0f}%, and anything structurally below 60% will limit reinvestment flexibility at this stage.",
                    score=(gross_margin - 60) / 120,
                    action="Prioritize offers with clearer contribution margin before layering on spend.",
                    assumption="Assuming the company needs reinvestable gross profit to fund growth.",
                    positions={"pricing": "margin-protective"},
                ),
                Insight(
                    topic="finance_counterweight",
                    text=f"Operational and sales friction average {round((ops + sales) / 2)}/100, so growth spend will be punished if execution remains messy.",
                    score=-((ops + sales) - 110) / 220,
                    action="Delay heavy acquisition spend until the delivery and sales motion are more predictable.",
                    assumption="Assuming efficiency will deteriorate before it improves if execution issues persist.",
                    positions={"investment": "sequenced"},
                ),
            ]

        if agent_name == "Marketing Agent":
            return [
                Insight(
                    topic="positioning",
                    text=f"Market attractiveness is {market}/100, but differentiation pressure is {diff}/100, so generic messaging will disappear into noise.",
                    score=(market - diff + pricing) / 220,
                    action="Anchor positioning around one measurable economic or strategic outcome for the ICP.",
                    assumption="Assuming buyers need a sharper reason to care than feature breadth.",
                    positions={"gtm": "outcome-led", "scope": "narrow"},
                ),
                Insight(
                    topic="channel_efficiency",
                    text=f"Sales friction is {sales}/100, which means marketing should optimize for trust and qualification, not just top-of-funnel volume.",
                    score=(70 - sales) / 180,
                    action="Invest in channels that pre-qualify demand and educate buyers before the sales handoff.",
                    assumption="Assuming low-quality leads would overwhelm a lean team.",
                    positions={"channel": "quality-over-volume"},
                ),
                Insight(
                    topic="narrative_counterweight",
                    text=f"Pricing power at {pricing}/100 suggests the market may reward strong value framing more than discounting.",
                    score=(pricing - 50) / 140,
                    action="Lead with ROI and strategic urgency rather than competing on price.",
                    assumption="Assuming buyers can rationalize spend when the value narrative is specific.",
                    positions={"pricing": "value-forward"},
                ),
            ]

        if agent_name == "Pricing Agent":
            return [
                Insight(
                    topic="price_signal",
                    text=f"Pricing power is {pricing}/100 and modeled price point is ${price_point:,.0f}; the price architecture must match buyer value and friction.",
                    score=(pricing - sales) / 180,
                    action="Use a value-based package with clear entry and expansion tiers rather than one flat offer.",
                    assumption="Assuming buyer value varies enough to justify tiering.",
                    positions={"pricing": "value-based", "packaging": "tiered"},
                ),
                Insight(
                    topic="discount_risk",
                    text=f"When differentiation pressure is {diff}/100, premature discounting teaches the market that the offer is interchangeable.",
                    score=(pricing - diff) / 200,
                    action="Limit discounts to tightly scoped proof-based pilots instead of broad concessions.",
                    assumption="Assuming price credibility is an early strategic asset.",
                    positions={"discounting": "limited"},
                ),
                Insight(
                    topic="sales_alignment",
                    text=f"Sales friction at {sales}/100 means complex packaging could slow deals more than it helps monetization.",
                    score=(60 - sales) / 170,
                    action="Keep the commercial menu simple enough for the sales motion the team can actually execute.",
                    assumption="Assuming the company cannot support a highly customized pricing operation yet.",
                    positions={"commercial_complexity": "simple"},
                ),
            ]

        if agent_name == "Supply Chain Agent":
            return [
                Insight(
                    topic="delivery_risk",
                    text=f"Operational complexity is {ops}/100, which makes promises dangerous unless delivery capacity is tightly controlled.",
                    score=(58 - ops) / 120,
                    action="Constrain the launch footprint until fulfillment reliability is proven.",
                    assumption="Assuming service failure would destroy credibility faster than slow growth.",
                    positions={"pace": "cautious", "operating_model": "reliability-first"},
                ),
                Insight(
                    topic="dependency_map",
                    text=f"The business model is {signals.business_model}, so partner and process dependencies need explicit failover plans.",
                    score=(55 - ops) / 180,
                    action="List critical dependencies and build contingency plans for the top two failure points.",
                    assumption="Assuming one fragile dependency can derail the whole launch.",
                    positions={"risk_posture": "mitigate"},
                ),
                Insight(
                    topic="launch_shape",
                    text=f"With combined operational and compliance load at {round((ops + risk) / 2)}/100, the operation should scale in layers, not all at once.",
                    score=(60 - ((ops + risk) / 2)) / 180,
                    action="Pilot one geography or one workflow before expanding operational scope.",
                    assumption="Assuming the launch can be segmented without losing strategic value.",
                    positions={"scope": "narrow"},
                ),
            ]

        if agent_name == "Hiring Agent":
            return [
                Insight(
                    topic="capacity_reality",
                    text=f"Talent load is {talent}/100, so execution risk depends on whether a small team can cover the critical roles fast enough.",
                    score=(58 - talent) / 140,
                    action="Identify the two must-have roles and delay all non-core hiring until those seats are covered.",
                    assumption="Assuming leadership bandwidth is the true scarce resource, not headcount budget alone.",
                    positions={"hiring": "critical-roles-only"},
                ),
                Insight(
                    topic="org_bloat",
                    text=f"At {request.company_stage} stage, over-hiring before repeatability is proven will create drag instead of leverage.",
                    score=(finance - talent) / 180,
                    action="Use partners or contractors for temporary gaps instead of building a heavy org too early.",
                    assumption="Assuming flexibility matters more than permanent structure right now.",
                    positions={"hiring_model": "lean-flex"},
                ),
                Insight(
                    topic="managerial_load",
                    text=f"Sales and operational friction average {round((sales + ops) / 2)}/100, which means every added function increases coordination overhead.",
                    score=(65 - ((sales + ops) / 2)) / 170,
                    action="Sequence hiring only after process ownership is clear and role definitions are tight.",
                    assumption="Assuming undefined roles would compound execution confusion.",
                    positions={"org_design": "sequenced"},
                ),
            ]

        if agent_name == "Risk Agent":
            return [
                Insight(
                    topic="downside_asymmetry",
                    text=f"Compliance risk is {risk}/100 and operational complexity is {ops}/100, so the downside is asymmetric if controls lag ambition.",
                    score=(48 - ((risk + ops) / 2)) / 120,
                    action="Require a mitigation plan for the top strategic and regulatory failure modes before launch.",
                    assumption="Assuming one avoidable control failure could wipe out early momentum.",
                    positions={"risk_posture": "control-first", "pace": "cautious"},
                ),
                Insight(
                    topic="concentration",
                    text=f"Sales friction at {sales}/100 increases concentration risk because a small number of deals or partners may dominate early outcomes.",
                    score=(52 - sales) / 160,
                    action="Avoid betting the entire plan on one channel, partner, or enterprise logo.",
                    assumption="Assuming concentration risk is elevated in the first phase.",
                    positions={"channel": "diversified"},
                ),
                Insight(
                    topic="mitigation_quality",
                    text="If the board proceeds, every major assumption needs an owner, a metric, and a stop-loss threshold.",
                    score=-0.05,
                    action="Define stop-loss triggers so the company knows when to halt, narrow, or rework the plan.",
                    assumption="Assuming the company will need explicit off-ramps under uncertainty.",
                    positions={"decision_gate": "stop-loss"},
                ),
            ]

        return [
            Insight(
                topic="sales_motion",
                text=f"Sales friction is {sales}/100 and pricing power is {pricing}/100, so the sales motion must fit both deal complexity and buyer economics.",
                score=(pricing - sales) / 160,
                action="Match the initial sales motion to one ICP with a short proof path and clear ROI story.",
                assumption="Assuming close rates improve when the team sells one clear story first.",
                positions={"channel": "focused-sales"},
            ),
            Insight(
                topic="closeability",
                text=f"Market attractiveness is {market}/100, but not every interested buyer can navigate the buying process we are implying.",
                score=(market - sales) / 180,
                action="Qualify early buyers for urgency, authority, and implementation readiness before scaling pipeline.",
                assumption="Assuming pipeline quality matters more than raw lead volume at this stage.",
                positions={"pipeline": "high-quality"},
            ),
            Insight(
                topic="pricing_simplicity",
                text=f"At ${price_point:,.0f} modeled pricing, every extra approval layer will slow the motion unless the value proof is obvious.",
                score=(60 - sales + pricing) / 200,
                action="Keep the deal structure simple enough to close without a heavy solutions team.",
                assumption="Assuming the company wants speed of close more than custom deal design.",
                positions={"commercial_complexity": "simple"},
            ),
        ]

    def _select_insights(self, insights: List[Insight], agent_memory: Dict[str, object], round_number: int) -> List[Insight]:
        used_topics = set(agent_memory.get("used_topics", []))
        fresh = [insight for insight in insights if insight.topic not in used_topics]
        pool = fresh if fresh else insights
        ranked = sorted(pool, key=lambda item: abs(item.score), reverse=True)
        if round_number == 1:
            return ranked[:2]
        if round_number == 2:
            return ranked[:3]
        return ranked[-1:] + ranked[:2]

    def _pick_references(
        self,
        profile: AgentProfile,
        full_history: List[AgentTurn],
        latest_turns: Dict[str, AgentTurn],
        conflicts: List[ConflictRecord],
    ) -> Tuple[List[str], List[str]]:
        own_turn = latest_turns.get(profile.definition.name)
        if full_history:
            challengers: List[str] = []
            for turn in latest_turns.values():
                if turn.agent_name == profile.definition.name:
                    continue
                if own_turn is None or turn.stance != own_turn.stance:
                    challengers.append(turn.agent_name)
            if challengers:
                chosen = challengers[:2]
                return chosen, chosen

        if conflicts:
            agents = [name for name in conflicts[-1].agents if name != profile.definition.name]
            if agents:
                return agents[:2], agents[:2]

        references = [name for name in profile.default_challenge_targets if name != profile.definition.name][:2]
        challenged = references[:1]
        return references, challenged

    def _compose_message(
        self,
        profile: AgentProfile,
        selected: List[Insight],
        stance: DecisionStatus,
        confidence: int,
        round_number: int,
        reference_names: List[str],
        challenged_agents: List[str],
        round_summaries: List[RoundSummary],
        estimated_metrics: Dict[str, float],
        calculations: List[str],
        memory_references: List[str],
        research_points: List[str],
        scenario_name: str,
    ) -> str:
        opening = {
            "GO": "I support moving forward",
            "MODIFY": "I support a modified path",
            "NO GO": "I do not support approval yet",
        }[stance]
        evidence_sentence = " ".join(insight.text for insight in selected[:2])
        action_sentence = " ".join(insight.action for insight in selected[:2])
        metric_sentence = (
            f"Scenario {scenario_name} currently models ROI at {estimated_metrics.get('expected_roi_pct', 0):.1f}%, "
            f"payback at {estimated_metrics.get('estimated_payback_months', 0):.1f} months, and a launch budget of "
            f"${estimated_metrics.get('launch_budget', 0):,.0f}."
        )
        calculation_sentence = calculations[0] if calculations else ""
        research_sentence = research_points[0] if research_points else ""

        if reference_names:
            if challenged_agents:
                reference_sentence = (
                    f"I am explicitly pressuring {', '.join(challenged_agents)} to defend the assumptions they are carrying."
                )
            else:
                reference_sentence = f"I am aligned with parts of {', '.join(reference_names)} but only if the evidence holds."
        else:
            reference_sentence = "I am treating this as a fresh decision with limited prior consensus."

        if memory_references:
            memory_sentence = memory_references[0]
        else:
            memory_sentence = "I am relying on the current board memory and prior round summaries rather than repeating opening claims."

        if round_summaries and round_number > 1:
            prior_tension = round_summaries[-1].conflict_points[0] if round_summaries[-1].conflict_points else "board alignment"
            closing = f"The prior round left {prior_tension} unresolved, so my recommendation tightens the decision boundary."
        else:
            closing = "This is my opening domain position for the board."

        return (
            f"[{profile.definition.name} | Round {round_number}]: {opening} at {confidence}% confidence. "
            f"{evidence_sentence} {research_sentence} {metric_sentence} {calculation_sentence} {reference_sentence} "
            f"{memory_sentence} {action_sentence} {closing}"
        )

    def _score_to_stance(self, stance_score: float, round_number: int) -> Tuple[DecisionStatus, int]:
        if stance_score >= 0.18:
            stance: DecisionStatus = "GO"
        elif stance_score <= -0.12:
            stance = "NO GO"
        else:
            stance = "MODIFY"
        confidence = int(max(55, min(95, 62 + abs(stance_score) * 85 + (round_number - 1) * 4)))
        return stance, confidence

    def _latest_turns(self, full_history: Iterable[AgentTurn]) -> Dict[str, AgentTurn]:
        latest: Dict[str, AgentTurn] = {}
        for turn in full_history:
            latest[turn.agent_name] = turn
        return latest

    def _board_split(self, turns: Iterable[AgentTurn]) -> Dict[str, int]:
        board_split = {"go": 0, "modify": 0, "no_go": 0}
        for turn in turns:
            if turn.stance == "GO":
                board_split["go"] += 1
            elif turn.stance == "NO GO":
                board_split["no_go"] += 1
            else:
                board_split["modify"] += 1
        return board_split

    def _detect_channel(self, text: str) -> str:
        if any(keyword in text for keyword in ["enterprise", "b2b", "procurement", "it team", "account executive"]):
            return "B2B"
        if any(keyword in text for keyword in ["consumer", "d2c", "retail", "shopper", "subscriber"]):
            return "B2C"
        return "Hybrid"

    def _detect_business_model(self, text: str) -> str:
        if any(keyword in text for keyword in ["hardware", "device", "manufacturing"]):
            return "hardware"
        if any(keyword in text for keyword in ["marketplace", "take rate", "vendor network"]):
            return "marketplace"
        if any(keyword in text for keyword in ["subscription", "saas", "arr", "seat-based"]):
            return "subscription"
        if any(keyword in text for keyword in ["software", "api", "platform"]):
            return "software"
        return "service"

    def _derive_metrics(
        self,
        request: AnalyzeRequest,
        channel: str,
        market_attractiveness: int,
        growth_potential: int,
        financial_viability: int,
        operational_complexity: int,
        compliance_risk: int,
        pricing_power: int,
        sales_friction: int,
        differentiation_pressure: int,
        numeric_metrics: Dict[str, float],
        external_research: BrightDataResearch,
    ) -> Dict[str, float]:
        runway = numeric_metrics.get("runway_months", 12.0)
        gross_margin_pct = numeric_metrics.get("gross_margin", 62.0)
        price_point = numeric_metrics.get("price_point", 12999.0 if channel == "B2B" else 249.0)
        budget_change_pct = numeric_metrics.get("scenario_budget_change_pct", 0.0)

        if channel == "B2B":
            expected_customers = max(
                3,
                round((market_attractiveness + growth_potential + pricing_power - sales_friction - compliance_risk) / 18),
            )
        else:
            expected_customers = max(
                40,
                round((market_attractiveness + growth_potential + pricing_power - sales_friction) * 2.6),
            )

        demand_multiplier = self._research_demand_multiplier(external_research)
        expected_customers = max(1, round(expected_customers * demand_multiplier))

        win_rate_pct = self._clamp(18 + (market_attractiveness + pricing_power - sales_friction - differentiation_pressure) / 3, 8, 62)
        monthly_leads = max(24, round(expected_customers / max(win_rate_pct / 100, 0.08)))
        launch_budget = max(
            24000.0,
            price_point * (2.2 if channel == "B2B" else 40.0) * (1 + (operational_complexity + compliance_risk) / 250),
        )
        launch_budget *= 1 + (budget_change_pct / 100) * 0.5
        monthly_revenue = (expected_customers * price_point) / 12
        annual_revenue = expected_customers * price_point
        gross_profit = annual_revenue * (gross_margin_pct / 100)
        expected_roi_pct = ((gross_profit - launch_budget) / launch_budget) * 100
        estimated_payback_months = launch_budget / max(monthly_revenue * (gross_margin_pct / 100), 1.0)
        break_even_customers = max(1, round(launch_budget / max(price_point * (gross_margin_pct / 100), 1.0)))
        burn_multiple = max(0.6, (launch_budget / max(monthly_revenue, 1.0)) / 3.0)
        risk_adjusted_score = self._clamp(
            financial_viability + market_attractiveness - compliance_risk - operational_complexity / 2,
            5,
            95,
        )

        return {
            "expected_customers_12m": float(expected_customers),
            "expected_win_rate_pct": float(win_rate_pct),
            "monthly_leads_required": float(monthly_leads),
            "launch_budget": round(launch_budget, 2),
            "monthly_revenue_run_rate": round(monthly_revenue, 2),
            "projected_annual_revenue": round(annual_revenue, 2),
            "projected_gross_profit": round(gross_profit, 2),
            "expected_roi_pct": round(expected_roi_pct, 2),
            "estimated_payback_months": round(estimated_payback_months, 2),
            "break_even_customers": float(break_even_customers),
            "risk_adjusted_score": float(risk_adjusted_score),
            "burn_multiple": round(burn_multiple, 2),
            "runway_months": float(runway),
            "gross_margin_pct": float(gross_margin_pct),
            "price_point": round(price_point, 2),
            "external_signal_count": float(len(external_research.all_hits())),
        }

    def _build_estimated_metrics(self, agent_name: str, signals: BusinessSignals) -> Dict[str, float]:
        metrics = dict(signals.derived_metrics)
        if agent_name == "Finance Agent":
            metrics["cash_buffer_months"] = round(max(0.0, metrics["runway_months"] - metrics["estimated_payback_months"]), 2)
        elif agent_name == "Marketing Agent":
            metrics["channel_efficiency_index"] = round(
                max(0.0, signals.market_attractiveness + signals.pricing_power - signals.differentiation_pressure), 2
            )
        elif agent_name == "Sales Strategy Agent":
            metrics["pipeline_value"] = round(
                metrics["monthly_leads_required"] * metrics["price_point"] * max(metrics["expected_win_rate_pct"] / 100, 0.1),
                2,
            )
        elif agent_name == "Risk Agent":
            metrics["risk_penalty_pct"] = round(
                max(5.0, (signals.compliance_risk + signals.operational_complexity) / 2.2),
                2,
            )
        elif agent_name == "Hiring Agent":
            metrics["critical_hires_required"] = float(2 if signals.talent_load < 65 else 3)
        elif agent_name == "Supply Chain Agent":
            metrics["fulfillment_stress_pct"] = round(
                max(10.0, (signals.operational_complexity + signals.sales_friction) / 1.8),
                2,
            )
        return metrics

    def _build_calculations(self, agent_name: str, metrics: Dict[str, float]) -> List[str]:
        calculations = [
            (
                "Modeled ROI = "
                f"(${metrics.get('projected_gross_profit', 0):,.0f} gross profit - ${metrics.get('launch_budget', 0):,.0f} launch budget) "
                f"/ ${metrics.get('launch_budget', 0):,.0f} = {metrics.get('expected_roi_pct', 0):.1f}%."
            ),
            (
                "Estimated payback = "
                f"${metrics.get('launch_budget', 0):,.0f} / (${metrics.get('monthly_revenue_run_rate', 0):,.0f} monthly revenue x "
                f"{metrics.get('gross_margin_pct', 0):.0f}% gross margin) = {metrics.get('estimated_payback_months', 0):.1f} months."
            ),
        ]

        if agent_name == "Finance Agent":
            calculations.append(
                "Cash buffer after modeled payback = "
                f"{metrics.get('runway_months', 0):.1f} runway months - {metrics.get('estimated_payback_months', 0):.1f} payback months = "
                f"{metrics.get('cash_buffer_months', 0):.1f} months."
            )
        elif agent_name == "Marketing Agent":
            calculations.append(
                "Channel efficiency index = "
                f"{metrics.get('channel_efficiency_index', 0):.1f}, combining demand, pricing power, and differentiation pressure."
            )
        elif agent_name == "Risk Agent":
            calculations.append(
                "Risk penalty = "
                f"{metrics.get('risk_penalty_pct', 0):.1f}% based on combined compliance and operating strain."
            )
        elif agent_name == "Hiring Agent":
            calculations.append(
                "Critical hiring plan assumes "
                f"{metrics.get('critical_hires_required', 0):.0f} core hires before broader scale-up."
            )

        return calculations

    def _build_memory_references(self, agent_memory: Dict[str, object], scenario_name: str) -> List[str]:
        references: List[str] = []
        past_failures = list(agent_memory.get("past_failures", []))
        past_arguments = list(agent_memory.get("past_arguments", []))
        prior_refs = list(agent_memory.get("memory_references", []))

        if past_failures:
            references.append(
                f"Previously, similar simulations broke on '{past_failures[0]}', so I am tightening the recommendation in {scenario_name}."
            )
        if past_arguments:
            references.append(
                f"In earlier simulations, the board kept returning to '{past_arguments[0]}'; I am using that lesson instead of restarting the debate."
            )
        if prior_refs:
            references.extend(prior_refs[:1])

        return references[:2]

    def _fetch_external_research(self, request: AnalyzeRequest) -> BrightDataResearch:
        query_specs = self._build_research_queries(request)
        if not query_specs:
            return BrightDataResearch()
        return self.brightdata_client.fetch_market_research(query_specs)

    def _build_research_queries(self, request: AnalyzeRequest) -> List[Tuple[str, str]]:
        topic_seed = self._research_subject(request)
        if not topic_seed:
            return []

        region = "" if not request.region or request.region.lower() == "global" else request.region
        scope = f"{topic_seed} {region}".strip()
        lower_problem = request.business_problem.lower()
        local_business = any(
            keyword in lower_problem
            for keyword in [
                "near",
                "college",
                "campus",
                "store",
                "shop",
                "restaurant",
                "cafe",
                "gym",
                "arcade",
                "game center",
                "gaming center",
                "salon",
                "lounge",
            ]
        )
        regulated = any(
            keyword in lower_problem
            for keyword in ["healthcare", "fintech", "insurance", "payments", "compliance", "privacy", "regulated"]
        )

        queries: List[Tuple[str, str]] = [
            ("demand", f"{scope} customer demand market size trends"),
            ("competition", f"{scope} competitors alternatives market leaders"),
            ("pricing", f"{scope} pricing rates memberships cost to customers"),
        ]
        if local_business:
            queries.append(("location", f"{scope} students foot traffic campus demand local market"))
        else:
            queries.append(("location", f"{scope} local demand adoption buyer interest"))

        risk_query = (
            f"{scope} regulations permits compliance operating costs"
            if regulated or local_business
            else f"{scope} operating risks switching costs implementation barriers"
        )
        queries.append(("risk", risk_query))
        return queries[:5]

    def _research_subject(self, request: AnalyzeRequest) -> str:
        subject = " ".join(filter(None, [request.industry or "", request.business_problem]))
        subject = re.sub(r"conversation with the user:|additional background:", " ", subject, flags=re.IGNORECASE)
        subject = re.sub(r"message\s+\d+\s+to\s+[^:]+:\s*", " ", subject, flags=re.IGNORECASE)
        subject = re.sub(r"\s+", " ", subject).strip()
        return subject[:160]

    def _apply_external_research(
        self,
        external_research: BrightDataResearch,
        market_attractiveness: int,
        growth_potential: int,
        financial_viability: int,
        operational_complexity: int,
        compliance_risk: int,
        pricing_power: int,
        sales_friction: int,
        differentiation_pressure: int,
        evidence: List[str],
    ) -> Tuple[int, int, int, int, int, int, int, int, List[str]]:
        if not external_research.has_hits():
            return (
                market_attractiveness,
                growth_potential,
                financial_viability,
                operational_complexity,
                compliance_risk,
                pricing_power,
                sales_friction,
                differentiation_pressure,
                evidence,
            )

        demand_text = " ".join(external_research.summaries("demand", limit=3)).lower()
        competition_text = " ".join(external_research.summaries("competition", limit=3)).lower()
        pricing_text = " ".join(external_research.summaries("pricing", limit=3)).lower()
        risk_text = " ".join(external_research.summaries("risk", limit=3)).lower()
        location_text = " ".join(external_research.summaries("location", limit=3)).lower()

        demand_signal = self._keyword_balance(
            demand_text,
            positive=["growing", "growth", "rising", "popular", "demand", "adoption", "student", "traffic", "expansion"],
            negative=["decline", "slow", "weak", "drop", "closing", "downturn"],
        )
        competition_signal = self._keyword_balance(
            competition_text,
            positive=["crowded", "competitive", "saturated", "incumbent", "many competitors", "price war"],
            negative=["underserved", "whitespace", "few competitors", "limited options"],
        )
        pricing_signal = self._keyword_balance(
            pricing_text,
            positive=["premium", "membership", "ticket", "hourly", "package", "pricing"],
            negative=["cheap", "discount", "free", "low-cost"],
        )
        risk_signal = self._keyword_balance(
            risk_text,
            positive=["regulation", "permit", "license", "compliance", "safety", "lawsuit", "cost"],
            negative=["simple", "low barrier", "easy to start"],
        )
        location_signal = self._keyword_balance(
            location_text,
            positive=["campus", "students", "foot traffic", "walkable", "college town", "busy"],
            negative=["remote", "low traffic", "quiet"],
        )

        market_attractiveness += len(external_research.get("demand")) * 2 + max(-6, min(8, demand_signal * 2))
        growth_potential += max(-5, min(7, demand_signal * 2 + location_signal))
        differentiation_pressure += len(external_research.get("competition")) * 3 + max(0, competition_signal * 2)
        pricing_power += max(-8, min(7, pricing_signal * 2 - max(0, competition_signal)))
        sales_friction += max(0, competition_signal * 2) + max(0, risk_signal)
        compliance_risk += len(external_research.get("risk")) * 2 + max(0, risk_signal * 2)
        operational_complexity += max(0, risk_signal * 2) + max(0, -location_signal)
        financial_viability += max(-8, min(8, demand_signal + pricing_signal - risk_signal - max(0, competition_signal)))

        for topic in ["demand", "competition", "pricing", "location", "risk"]:
            summary = self._summarize_research_topic(external_research, topic)
            if summary:
                evidence.append(f"Bright Data {topic} scan: {summary}.")

        return (
            market_attractiveness,
            growth_potential,
            financial_viability,
            operational_complexity,
            compliance_risk,
            pricing_power,
            sales_friction,
            differentiation_pressure,
            evidence,
        )

    def _infer_price_point_from_research(self, external_research: BrightDataResearch) -> float | None:
        values: List[float] = []
        for hit in external_research.get("pricing"):
            values.extend(self._extract_currency_values(f"{hit.title} {hit.snippet}"))

        filtered = [value for value in values if 5 <= value <= 250000]
        if not filtered:
            return None

        filtered.sort()
        if len(filtered) > 4:
            filtered = filtered[1:-1]
        return round(mean(filtered), 2)

    def _extract_currency_values(self, text: str) -> List[float]:
        values: List[float] = []
        patterns = [
            r"[$€£₹]\s*([\d,]+(?:\.\d+)?)",
            r"\b(?:usd|inr|rs\.?|eur|gbp)\s*([\d,]+(?:\.\d+)?)",
        ]
        for pattern in patterns:
            for match in re.findall(pattern, text, flags=re.IGNORECASE):
                try:
                    values.append(float(match.replace(",", "")))
                except ValueError:
                    continue
        return values

    def _build_research_points(self, agent_name: str, external_research: BrightDataResearch) -> List[str]:
        if not external_research.has_hits():
            return []

        labels = {
            "demand": "customer demand",
            "competition": "competition",
            "pricing": "pricing",
            "location": "the local market",
            "risk": "operating risk",
        }
        points: List[str] = []
        for topic in self._research_topics_for_agent(agent_name):
            summary = self._summarize_research_topic(external_research, topic)
            if summary:
                points.append(f"Recent web research on {labels.get(topic, topic)} suggests {summary}.")

        if not points:
            fallback = self._summarize_research_topic(external_research, external_research.topics()[0])
            if fallback:
                points.append(f"Recent web research suggests {fallback}.")
        return points[:2]

    def _research_topics_for_agent(self, agent_name: str) -> List[str]:
        mapping = {
            "CEO Agent": ["demand", "competition", "risk"],
            "Startup Builder Agent": ["demand", "location"],
            "Market Research Agent": ["demand", "competition", "location"],
            "Finance Agent": ["pricing", "competition", "risk"],
            "Marketing Agent": ["demand", "competition"],
            "Pricing Agent": ["pricing", "competition"],
            "Supply Chain Agent": ["risk", "location"],
            "Hiring Agent": ["demand", "location"],
            "Risk Agent": ["risk", "competition"],
            "Sales Strategy Agent": ["pricing", "demand", "competition"],
        }
        return mapping.get(agent_name, ["demand", "competition"])

    def _summarize_research_topic(self, external_research: BrightDataResearch, topic: str) -> str:
        hits = external_research.get(topic)
        if not hits:
            return ""
        best_hit = max(hits, key=lambda hit: self._research_hit_score(topic, hit.title, hit.snippet))
        snippet = best_hit.snippet.strip()
        title = best_hit.title.strip()
        if snippet and self._research_hit_score(topic, snippet, snippet) >= self._research_hit_score(topic, title, ""):
            summary = snippet
        elif snippet:
            summary = f"{title}. {snippet}" if title else snippet
        else:
            summary = title
        return summary[:220].rstrip(".")

    def _keyword_balance(self, text: str, positive: List[str], negative: List[str]) -> int:
        positive_hits = sum(text.count(keyword) for keyword in positive)
        negative_hits = sum(text.count(keyword) for keyword in negative)
        return positive_hits - negative_hits

    def _research_hit_score(self, topic: str, title: str, snippet: str) -> int:
        text = f"{title} {snippet}".lower()
        topic_keywords = {
            "demand": ["demand", "popular", "students", "near you", "foot traffic", "growing", "gaming"],
            "competition": ["competitor", "alternatives", "gaming cafe", "arcade", "bowling", "zone"],
            "pricing": ["price", "pricing", "cost", "ticket", "entry", "recharge", "membership", "rs", "$", "₹"],
            "location": ["college", "campus", "students", "near", "city", "mall"],
            "risk": ["permit", "license", "cost", "setup", "investment", "safety", "compliance"],
        }
        score = len(snippet)
        for keyword in topic_keywords.get(topic, []):
            score += text.count(keyword) * 25
        if any(symbol in text for symbol in ["$", "₹", "rs", "usd", "inr"]):
            score += 40
        if "pdf" in text and len(snippet) < 40:
            score -= 30
        return score

    def _research_demand_multiplier(self, external_research: BrightDataResearch) -> float:
        if not external_research.has_hits():
            return 1.0

        demand_text = " ".join(external_research.summaries("demand", limit=3)).lower()
        location_text = " ".join(external_research.summaries("location", limit=3)).lower()
        competition_text = " ".join(external_research.summaries("competition", limit=3)).lower()

        demand_balance = self._keyword_balance(
            demand_text,
            positive=["growing", "growth", "rising", "popular", "demand", "student", "busy", "expansion"],
            negative=["decline", "weak", "slowing", "drop", "closing"],
        )
        location_balance = self._keyword_balance(
            location_text,
            positive=["students", "foot traffic", "campus", "walkable", "busy"],
            negative=["remote", "low traffic", "quiet"],
        )
        competition_penalty = max(
            0,
            self._keyword_balance(
                competition_text,
                positive=["crowded", "competitive", "saturated", "many competitors"],
                negative=["underserved", "few competitors"],
            ),
        )
        multiplier = 1 + demand_balance * 0.04 + location_balance * 0.03 - competition_penalty * 0.02
        return max(0.7, min(1.45, multiplier))

    def _enhance_message_with_featherless(
        self,
        profile: AgentProfile,
        request: AnalyzeRequest,
        round_number: int,
        selected: List[Insight],
        estimated_metrics: Dict[str, float],
        calculations: List[str],
        references: List[str],
        memory_references: List[str],
        fallback_message: str,
    ) -> str:
        if round_number < 3 or profile.definition.name != "CEO Agent":
            return fallback_message

        if not self.featherless_client.is_configured():
            return fallback_message

        prompt = (
            f"Rewrite the following executive board turn into a sharper boardroom message while preserving the same stance and numbers. "
            f"Return one concise paragraph beginning with '[{profile.definition.name} | Round {round_number}]'.\n\n"
            f"Scenario: {request.scenario_name}\n"
            f"Role: {profile.definition.role}\n"
            f"Key arguments: {' '.join(insight.text for insight in selected[:2])}\n"
            f"Actions: {' '.join(insight.action for insight in selected[:2])}\n"
            f"Estimated metrics: {json.dumps(estimated_metrics, sort_keys=True)}\n"
            f"Calculations: {' '.join(calculations[:2])}\n"
            f"Referenced agents: {', '.join(references) if references else 'none'}\n"
            f"Memory references: {' '.join(memory_references) if memory_references else 'none'}\n"
            f"Fallback message: {fallback_message}"
        )
        return self.featherless_client.generate_boardroom_message(
            system_prompt=profile.definition.system_prompt,
            prompt=prompt,
            fallback=fallback_message,
        )

    def _extract_numeric_metrics(self, text: str, known_metrics: Dict[str, object]) -> Dict[str, float]:
        metrics: Dict[str, float] = {}
        normalized = {key.lower(): value for key, value in known_metrics.items()}
        aliases = {
            "runway_months": ["runway", "runway_months"],
            "gross_margin": ["gross_margin", "gross margin"],
            "cac_payback_months": ["cac_payback", "cac payback", "payback"],
            "price_point": ["price", "pricing", "price_point", "acv", "arr per customer"],
            "scenario_budget_change_pct": ["scenario_budget_change_pct", "budget_change_pct"],
        }
        for target, names in aliases.items():
            for name in names:
                if name in normalized:
                    try:
                        metrics[target] = float(str(normalized[name]).replace("%", "").replace("$", "").replace(",", ""))
                        break
                    except ValueError:
                        continue

        money_match = re.search(r"\$([\d,.]+)\s*(m|k)?", text)
        if money_match and "price_point" not in metrics:
            value = float(money_match.group(1).replace(",", ""))
            scale = money_match.group(2)
            if scale == "m":
                value *= 1_000_000
            elif scale == "k":
                value *= 1_000
            metrics["price_point"] = value

        percent_match = re.search(r"(\d{1,3})\s*%\s*gross margin", text)
        if percent_match and "gross_margin" not in metrics:
            metrics["gross_margin"] = float(percent_match.group(1))

        runway_match = re.search(r"(\d{1,2})\s*month[s]?\s*runway", text)
        if runway_match and "runway_months" not in metrics:
            metrics["runway_months"] = float(runway_match.group(1))

        payback_match = re.search(r"(\d{1,2})\s*month[s]?\s*(cac )?payback", text)
        if payback_match and "cac_payback_months" not in metrics:
            metrics["cac_payback_months"] = float(payback_match.group(1))

        return metrics

    def _clamp(self, value: float, low: int = 5, high: int = 95) -> int:
        return int(max(low, min(high, round(value))))
