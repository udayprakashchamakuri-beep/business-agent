from __future__ import annotations

from statistics import mean
from typing import Dict, List

from backend.controller.schemas import (
    ActionPlan,
    AgentTurn,
    AnalyzeRequest,
    ChannelPlan,
    CostItem,
    ExecutionStep,
    FinancialAssumption,
    FinancialPlan,
    HiringPlan,
    HiringRolePlan,
    MarketingStrategy,
    RevenueProjection,
)


class ActionEngine:
    def build(
        self,
        request: AnalyzeRequest,
        final_decision: str,
        latest_turns: Dict[str, AgentTurn],
    ) -> ActionPlan:
        metrics = self._blended_metrics(latest_turns)
        execution_plan = self._build_execution_plan(request, final_decision, latest_turns, metrics)
        marketing_strategy = self._build_marketing_strategy(request, latest_turns, metrics)
        financial_plan = self._build_financial_plan(request, final_decision, latest_turns, metrics)
        hiring_plan = self._build_hiring_plan(request, final_decision, latest_turns, metrics)

        return ActionPlan(
            execution_plan=execution_plan,
            marketing_strategy=marketing_strategy,
            financial_plan=financial_plan,
            hiring_plan=hiring_plan,
        )

    def _build_execution_plan(
        self,
        request: AnalyzeRequest,
        final_decision: str,
        latest_turns: Dict[str, AgentTurn],
        metrics: Dict[str, float],
    ) -> List[ExecutionStep]:
        launch_shape = "pilot" if final_decision in {"MODIFY", "NO GO"} else "launch"
        return [
            ExecutionStep(
                step=f"Define the initial {launch_shape} wedge and lock the ICP, use case, and success thresholds.",
                owner="CEO Agent",
                timeline="Week 1",
                success_metric="Board signs off on one segment, one offer, and three measurable launch gates.",
            ),
            ExecutionStep(
                step="Validate 8-10 buyers or design partners and pressure-test urgency, objections, and close blockers.",
                owner="Market Research Agent",
                timeline="Weeks 1-2",
                success_metric="At least 5 qualified buyers confirm the problem is urgent enough to buy or pilot.",
            ),
            ExecutionStep(
                step="Launch the offer with a controlled sales and marketing motion rather than a broad market blast.",
                owner="Sales Strategy Agent",
                timeline="Weeks 3-6",
                success_metric=f"Generate {int(max(12, metrics.get('monthly_leads_required', 12)))} qualified leads and close the first 2 reference customers.",
            ),
            ExecutionStep(
                step="Instrument unit economics, implementation effort, and risk triggers before scaling spend.",
                owner="Finance Agent",
                timeline="Weeks 4-8",
                success_metric=f"Keep modeled payback below {metrics.get('estimated_payback_months', 12):.1f} months and gross margin above {metrics.get('gross_margin_pct', 60):.0f}%.",
            ),
            ExecutionStep(
                step="Review launch data against stop-loss thresholds and either scale, narrow further, or pause.",
                owner="CEO Agent",
                timeline="Day 60-90",
                success_metric="Decision review completed with explicit scale/hold/stop resolution.",
            ),
        ]

    def _build_marketing_strategy(
        self,
        request: AnalyzeRequest,
        latest_turns: Dict[str, AgentTurn],
        metrics: Dict[str, float],
    ) -> MarketingStrategy:
        audience = self._first_objective(request) or f"Decision-makers in {request.industry or 'the target market'}"
        positioning = (
            f"{request.company_name} helps the first target segment remove costly workflow friction without adding operational drag."
        )
        core_message = (
            f"Buyers get faster ROI, lower manual effort, and a clearer payback path than the status quo. "
            f"The board is targeting {metrics.get('estimated_payback_months', 12):.1f}-month payback with disciplined rollout."
        )
        channels = [
            ChannelPlan(
                channel="LinkedIn outbound + founder content",
                objective="Reach operators who own the problem and can sponsor a pilot.",
                message="Lead with the economic cost of the current workflow and show a fast-path pilot.",
                budget_share_pct=35,
            ),
            ChannelPlan(
                channel="Design-partner webinars and case studies",
                objective="Build trust for a high-friction or regulated buyer journey.",
                message="Use real workflow metrics, implementation proof, and ROI snapshots.",
                budget_share_pct=30,
            ),
            ChannelPlan(
                channel="Account-based email + sales sequences",
                objective="Convert identified target accounts into live opportunities.",
                message="Offer a controlled pilot with measured milestones rather than a broad transformation promise.",
                budget_share_pct=35,
            ),
        ]
        ad_angles = [
            "Replace manual workflow bottlenecks with measurable time savings.",
            "Launch a tightly-scoped pilot before committing to full operational change.",
            "Show finance-grade ROI and risk controls before asking for broad adoption.",
        ]
        return MarketingStrategy(
            audience=audience,
            positioning=positioning,
            core_message=core_message,
            channels=channels,
            ad_angles=ad_angles,
        )

    def _build_financial_plan(
        self,
        request: AnalyzeRequest,
        final_decision: str,
        latest_turns: Dict[str, AgentTurn],
        metrics: Dict[str, float],
    ) -> FinancialPlan:
        launch_budget = metrics.get("launch_budget", 60000.0)
        monthly_marketing_cost = round(launch_budget * 0.22, 2)
        monthly_tooling_cost = round(launch_budget * 0.08, 2)
        monthly_delivery_cost = round(launch_budget * 0.11, 2)

        revenue_projection = [
            RevenueProjection(
                milestone="Month 3",
                customers=max(1, int(metrics.get("expected_customers_12m", 6) * 0.2)),
                revenue=round(metrics.get("projected_annual_revenue", 0.0) * 0.18, 2),
            ),
            RevenueProjection(
                milestone="Month 6",
                customers=max(2, int(metrics.get("expected_customers_12m", 6) * 0.45)),
                revenue=round(metrics.get("projected_annual_revenue", 0.0) * 0.42, 2),
            ),
            RevenueProjection(
                milestone="Month 12",
                customers=max(3, int(metrics.get("expected_customers_12m", 6))),
                revenue=round(metrics.get("projected_annual_revenue", 0.0), 2),
            ),
        ]
        assumptions = [
            FinancialAssumption(
                name="Price point",
                value=f"${metrics.get('price_point', 0):,.0f}",
                rationale="Taken from the base commercial model and adjusted through pricing debate.",
            ),
            FinancialAssumption(
                name="Gross margin",
                value=f"{metrics.get('gross_margin_pct', 0):.0f}%",
                rationale="Used to convert revenue into gross profit and payback estimates.",
            ),
            FinancialAssumption(
                name="Expected win rate",
                value=f"{metrics.get('expected_win_rate_pct', 0):.0f}%",
                rationale="Reflects the current mix of demand quality, pricing, and sales friction.",
            ),
            FinancialAssumption(
                name="Launch budget",
                value=f"${launch_budget:,.0f}",
                rationale="Derived from operating complexity, compliance load, and deal size.",
            ),
        ]
        monthly_costs = [
            CostItem(category="Demand generation", monthly_cost=monthly_marketing_cost),
            CostItem(category="Tooling and integrations", monthly_cost=monthly_tooling_cost),
            CostItem(category="Implementation and delivery", monthly_cost=monthly_delivery_cost),
        ]
        roi_estimate = (
            f"{final_decision} path currently models {metrics.get('expected_roi_pct', 0):.1f}% ROI "
            f"with payback in {metrics.get('estimated_payback_months', 0):.1f} months."
        )
        return FinancialPlan(
            assumptions=assumptions,
            monthly_costs=monthly_costs,
            revenue_projection=revenue_projection,
            roi_estimate=roi_estimate,
        )

    def _build_hiring_plan(
        self,
        request: AnalyzeRequest,
        final_decision: str,
        latest_turns: Dict[str, AgentTurn],
        metrics: Dict[str, float],
    ) -> HiringPlan:
        roles = [
            HiringRolePlan(
                role="Implementation / Customer Success Lead",
                timing="Immediate",
                reason="Protect onboarding quality and keep operational strain from spilling into churn.",
                estimated_monthly_cost=6500.0,
            ),
            HiringRolePlan(
                role="Sales Engineer or Solutions Consultant",
                timing="Month 2",
                reason="Support higher-friction deals and shorten time to credible proof.",
                estimated_monthly_cost=7200.0,
            ),
            HiringRolePlan(
                role="Growth or Demand Generation Manager",
                timing="Month 3-4",
                reason="Scale the winning channel after the first pilot economics are proven.",
                estimated_monthly_cost=5800.0,
            ),
        ]
        if final_decision == "NO GO":
            roles = roles[:2]

        return HiringPlan(
            roles=roles,
            hiring_sequence=[
                "Fill customer-facing delivery capacity first.",
                "Add technical sales support once the ICP and offer are stable.",
                "Scale demand generation only after the initial motion proves conversion quality.",
            ],
        )

    def _blended_metrics(self, latest_turns: Dict[str, AgentTurn]) -> Dict[str, float]:
        metric_values: Dict[str, List[float]] = {}
        for turn in latest_turns.values():
            for key, value in turn.estimated_metrics.items():
                metric_values.setdefault(key, []).append(value)
        return {
            key: round(mean(values), 2)
            for key, values in metric_values.items()
            if values
        }

    def _first_objective(self, request: AnalyzeRequest) -> str:
        if request.objectives:
            return request.objectives[0]
        return ""
