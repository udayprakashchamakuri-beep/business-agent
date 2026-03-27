from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

DecisionStatus = Literal["GO", "MODIFY", "NO GO"]
ReasoningMode = Literal["heuristic", "auto"]


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


class ConflictRecord(BaseModel):
    round: int
    topic: str
    agents: List[str]
    description: str
    severity: int = Field(ge=1, le=5)


class RoundSummary(BaseModel):
    round: int
    synopsis: str
    consensus_points: List[str] = Field(default_factory=list)
    conflict_points: List[str] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)


class FinalDecision(BaseModel):
    decision: DecisionStatus
    confidence: int = Field(ge=0, le=100)
    key_reasons: List[str]
    risks: List[str]
    recommended_actions: List[str]


class AnalyzeResponse(BaseModel):
    company_name: str
    agent_definitions: List[AgentDefinition]
    conversation: List[AgentTurn]
    round_summaries: List[RoundSummary]
    conflicts: List[ConflictRecord]
    final_output: FinalDecision
