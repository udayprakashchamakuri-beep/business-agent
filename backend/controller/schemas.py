from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

DecisionStatus = Literal["GO", "MODIFY", "NO GO"]
ReasoningMode = Literal["heuristic", "auto"]
MarketCondition = Literal["bearish", "base", "bullish"]
CompetitionLevel = Literal["low", "medium", "high"]
ConflictImpact = Literal["Low", "Medium", "High"]


class ScenarioVariation(BaseModel):
    scenario: str
    budget_change_pct: float = Field(default=0.0, description="Percent change applied to available budget/runway.")
    market_condition: MarketCondition = Field(default="base")
    competition_level: CompetitionLevel = Field(default="medium")
    pricing_change_pct: float = Field(default=0.0, description="Percent change applied to pricing assumptions.")
    notes: Optional[str] = None


class AnalyzeRequest(BaseModel):
    company_name: str = Field(default="Autonomous Venture")
    industry: Optional[str] = None
    region: Optional[str] = None
    company_stage: str = Field(default="Seed")
    business_problem: str = Field(
        ...,
        min_length=20,
        description="The business problem or strategic decision that the AI company board must debate.",
    )
    objectives: List[str] = Field(default_factory=list)
    current_constraints: List[str] = Field(default_factory=list)
    known_metrics: Dict[str, Any] = Field(default_factory=dict)
    reasoning_mode: ReasoningMode = Field(default="heuristic")
    scenario_name: str = Field(default="Base Scenario")
    scenario_variations: List[ScenarioVariation] = Field(default_factory=list)
    memory_key: Optional[str] = Field(default=None, description="Optional stable key for persistent learning context.")


class AgentDefinition(BaseModel):
    name: str
    role: str
    goals: List[str]
    constraints: List[str]
    decision_style: str
    priorities: List[str]
    challenge_pattern: str
    system_prompt: str


class AgentTurn(BaseModel):
    agent_name: str
    role: str
    round: int
    scenario_name: str = Field(default="Base Scenario")
    message: str
    stance: DecisionStatus
    confidence: int = Field(ge=0, le=100)
    topics: List[str] = Field(default_factory=list)
    key_points: List[str] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    references: List[str] = Field(default_factory=list)
    challenged_agents: List[str] = Field(default_factory=list)
    policy_positions: Dict[str, str] = Field(default_factory=dict)
    score_snapshot: Dict[str, int] = Field(default_factory=dict)
    estimated_metrics: Dict[str, float] = Field(default_factory=dict)
    calculations: List[str] = Field(default_factory=list)
    memory_references: List[str] = Field(default_factory=list)


class ConflictRecord(BaseModel):
    round: int
    topic: str
    agents: List[str]
    opposing_agents: List[str] = Field(default_factory=list)
    description: str
    severity: int = Field(ge=1, le=5)
    conflict_detected: bool = True
    conflict_type: str = Field(default="General disagreement")
    impact: ConflictImpact = Field(default="Medium")


class RoundSummary(BaseModel):
    round: int
    synopsis: str
    consensus_points: List[str] = Field(default_factory=list)
    conflict_points: List[str] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)
    numeric_highlights: Dict[str, float] = Field(default_factory=dict)


class ExecutionStep(BaseModel):
    step: str
    owner: str
    timeline: str
    success_metric: str


class ChannelPlan(BaseModel):
    channel: str
    objective: str
    message: str
    budget_share_pct: int = Field(ge=0, le=100)


class MarketingStrategy(BaseModel):
    audience: str
    positioning: str
    core_message: str
    channels: List[ChannelPlan] = Field(default_factory=list)
    ad_angles: List[str] = Field(default_factory=list)


class FinancialAssumption(BaseModel):
    name: str
    value: str
    rationale: str


class CostItem(BaseModel):
    category: str
    monthly_cost: float


class RevenueProjection(BaseModel):
    milestone: str
    customers: int
    revenue: float


class FinancialPlan(BaseModel):
    assumptions: List[FinancialAssumption] = Field(default_factory=list)
    monthly_costs: List[CostItem] = Field(default_factory=list)
    revenue_projection: List[RevenueProjection] = Field(default_factory=list)
    roi_estimate: str


class HiringRolePlan(BaseModel):
    role: str
    timing: str
    reason: str
    estimated_monthly_cost: float


class HiringPlan(BaseModel):
    roles: List[HiringRolePlan] = Field(default_factory=list)
    hiring_sequence: List[str] = Field(default_factory=list)


class ActionPlan(BaseModel):
    execution_plan: List[ExecutionStep] = Field(default_factory=list)
    marketing_strategy: MarketingStrategy
    financial_plan: FinancialPlan
    hiring_plan: HiringPlan


class ReasoningTraceItem(BaseModel):
    agent_name: str
    influence_score: float
    stance: DecisionStatus
    summary: str


class ExplainabilityReport(BaseModel):
    top_influencer: str
    conflicts: List[str] = Field(default_factory=list)
    final_reasoning_summary: str
    reasoning_trace: List[ReasoningTraceItem] = Field(default_factory=list)


class MemorySummary(BaseModel):
    recalled_simulations: int = 0
    prior_failures: List[str] = Field(default_factory=list)
    learned_adjustments: List[str] = Field(default_factory=list)
    prior_agent_arguments: Dict[str, List[str]] = Field(default_factory=dict)


class ScenarioOutcome(BaseModel):
    scenario: str
    decision: DecisionStatus
    confidence: int = Field(ge=0, le=100)
    difference_from_base: str
    reasoning_shift: List[str] = Field(default_factory=list)
    changed_agents: List[str] = Field(default_factory=list)
    top_influencer: str


class FinalDecision(BaseModel):
    decision: DecisionStatus
    confidence: int = Field(ge=0, le=100)
    key_reasons: List[str]
    risks: List[str]
    recommended_actions: List[str]


class ValidationCheck(BaseModel):
    decisions_made: bool
    multiple_scenarios_simulated: bool
    actions_generated: bool
    memory_used: bool
    passed: bool


class AnalyzeResponse(BaseModel):
    company_name: str
    agent_definitions: List[AgentDefinition]
    conversation: List[AgentTurn]
    round_summaries: List[RoundSummary]
    conflicts: List[ConflictRecord]
    final_output: FinalDecision
    actions: ActionPlan
    scenario_results: List[ScenarioOutcome] = Field(default_factory=list)
    explainability: ExplainabilityReport
    memory_summary: MemorySummary
    validation: ValidationCheck
