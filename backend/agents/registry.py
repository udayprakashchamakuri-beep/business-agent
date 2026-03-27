from __future__ import annotations

from typing import List

from backend.agents.base import Agent, AgentProfile
from backend.agents.prompts import build_agent_definitions
from backend.agents.reasoning import StrategicReasoner


def build_agent_roster() -> List[Agent]:
    definitions = build_agent_definitions()
    reasoner = StrategicReasoner()
    profiles = [
        AgentProfile(definition=definitions["Startup Builder Agent"], bias=0.16, weight=1.15, default_challenge_targets=["Finance Agent", "Risk Agent"]),
        AgentProfile(definition=definitions["Market Research Agent"], bias=0.02, weight=1.0, default_challenge_targets=["Marketing Agent", "Startup Builder Agent"]),
        AgentProfile(definition=definitions["Finance Agent"], bias=-0.14, weight=1.25, default_challenge_targets=["Startup Builder Agent", "Marketing Agent"]),
        AgentProfile(definition=definitions["Marketing Agent"], bias=0.10, weight=0.95, default_challenge_targets=["Finance Agent", "Market Research Agent"]),
        AgentProfile(definition=definitions["Pricing Agent"], bias=0.04, weight=0.95, default_challenge_targets=["Marketing Agent", "Sales Strategy Agent"]),
        AgentProfile(definition=definitions["Supply Chain Agent"], bias=-0.10, weight=1.05, default_challenge_targets=["Startup Builder Agent", "Marketing Agent"]),
        AgentProfile(definition=definitions["Hiring Agent"], bias=-0.03, weight=0.90, default_challenge_targets=["Startup Builder Agent", "Sales Strategy Agent"]),
        AgentProfile(definition=definitions["Risk Agent"], bias=-0.20, weight=1.30, default_challenge_targets=["Startup Builder Agent", "Marketing Agent"]),
        AgentProfile(definition=definitions["Sales Strategy Agent"], bias=0.05, weight=1.05, default_challenge_targets=["Pricing Agent", "Market Research Agent"]),
        AgentProfile(definition=definitions["CEO Agent"], bias=0.00, weight=1.50, default_challenge_targets=["Finance Agent", "Risk Agent"]),
    ]
    return [Agent(profile=profile, reasoner=reasoner) for profile in profiles]
