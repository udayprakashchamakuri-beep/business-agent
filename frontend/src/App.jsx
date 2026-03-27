import { useEffect, useMemo, useState } from "react";
import CommandConsoleDrawer from "./components/CommandConsoleDrawer";
import { AGENT_META, API_BASE, NAV_ITEMS, defaultTimeline, sampleProblem } from "./dashboardData";
import AgentsView from "./views/AgentsView";
import IntelligenceView from "./views/IntelligenceView";
import RiskView from "./views/RiskView";
import SimulationView from "./views/SimulationView";

function App() {
  const [activeView, setActiveView] = useState("simulation");
  const [form, setForm] = useState(buildDefaultForm());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typingIndex, setTypingIndex] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!loading) {
      return undefined;
    }

    const names = Object.keys(AGENT_META);
    const timer = window.setInterval(() => {
      setTypingIndex((current) => (current + 1) % names.length);
    }, 550);

    return () => window.clearInterval(timer);
  }, [loading]);

  const groupedConversation = useMemo(() => {
    const grouped = new Map();
    (result?.conversation ?? []).forEach((turn) => {
      const existing = grouped.get(turn.round) ?? [];
      existing.push(turn);
      grouped.set(turn.round, existing);
    });

    return Array.from(grouped.entries());
  }, [result]);

  const agentDefinitionsMap = useMemo(
    () => Object.fromEntries((result?.agent_definitions ?? []).map((entry) => [entry.name, entry])),
    [result],
  );

  const conversation = result?.conversation ?? [];
  const timeline = result?.round_summaries?.length ? result.round_summaries : defaultTimeline;
  const activeTypingAgent = Object.keys(AGENT_META)[typingIndex];
  const lastTurn = conversation[conversation.length - 1] ?? null;
  const speakingAgent = loading ? activeTypingAgent : lastTurn?.agent_name ?? "CEO Agent";
  const displayedRounds = result?.round_summaries?.length ?? 3;
  const currentRound = loading ? Math.min(3, Math.floor((typingIndex / 3) % 3) + 1) : lastTurn?.round ?? 0;
  const scenarioTitle = result?.company_name ?? form.company_name;
  const highestRisk = result?.final_output?.risks?.[0] ?? "Awaiting board debate.";
  const recommendedDirective =
    result?.final_output?.recommended_actions?.[0] ??
    result?.actions?.execution_plan?.[0]?.step ??
    "Awaiting executive directive.";

  const topConflictByRound = useMemo(() => {
    const map = new Map();
    (result?.conflicts ?? []).forEach((conflict) => {
      if (!map.has(conflict.round)) {
        map.set(conflict.round, conflict);
      }
    });
    return map;
  }, [result]);

  const intelligenceMetrics = useMemo(() => buildIntelligenceMetrics({ result, loading }), [result, loading]);
  const semanticStream = useMemo(() => buildSemanticStream({ result }), [result]);
  const timelinePoints = useMemo(() => buildInferenceTimeline({ result, timeline }), [result, timeline]);
  const agentCards = useMemo(
    () => buildAgentCards({ result, agentDefinitionsMap, speakingAgent, loading }),
    [result, agentDefinitionsMap, speakingAgent, loading],
  );
  const matrixStats = useMemo(() => buildMatrixStats({ result, loading }), [result, loading]);
  const riskAlerts = useMemo(() => buildRiskAlerts({ result }), [result]);
  const riskMetrics = useMemo(() => buildRiskMetrics({ result, highestRisk }), [result, highestRisk]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setActiveView("simulation");

    const payload = {
      company_name: form.company_name,
      industry: form.industry,
      region: form.region,
      company_stage: form.company_stage,
      business_problem: form.business_problem,
      objectives: splitList(form.objectives),
      current_constraints: splitList(form.current_constraints),
      known_metrics: {
        runway_months: Number(form.runway_months),
        gross_margin: Number(form.gross_margin),
        cac_payback_months: Number(form.cac_payback_months),
        price_point: Number(form.price_point),
      },
      scenario_variations: buildScenarioVariations(form),
    };

    try {
      setResult(createEmptyResult(form.company_name));

      const response = await fetch(`${API_BASE}/analyze/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Streaming response body is unavailable.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines.map((entry) => entry.trim()).filter(Boolean)) {
          const payloadLine = JSON.parse(line);
          if (payloadLine.type === "error") {
            throw new Error(payloadLine.error || "Unknown streaming error.");
          }
          if (payloadLine.type === "final") {
            setResult(payloadLine.result);
            continue;
          }
          setResult((current) => mergeStreamEvent(current ?? createEmptyResult(form.company_name), payloadLine));
        }
      }

      setConsoleOpen(false);
    } catch (submissionError) {
      setError(submissionError.message || "Unable to analyze the business problem.");
    } finally {
      setLoading(false);
    }
  }

  function applySample() {
    setForm(buildDefaultForm());
    setConsoleOpen(true);
  }

  function updateFormField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleConsole() {
    setConsoleOpen((current) => !current);
  }

  return (
    <div className={`obsidian-app app-view-${activeView}`}>
      <nav className="obsidian-nav global-nav">
        <div className="nav-left">
          <span className="brand">OBSIDIAN COMMAND</span>
          <div className="nav-links">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeView === item.id ? "nav-link active" : "nav-link"}
                onClick={() => setActiveView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="nav-right">
          <div className="global-search">
            <span className="material-symbols-outlined">search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="QUERY_SYSTEM..."
              aria-label="Search command console data"
            />
          </div>
          <div className="live-pill">
            <span className="status-dot" />
            <span>SYSTEM LIVE: NODE_01</span>
          </div>
          <div className="nav-icon-row">
            <IconButton icon="account_tree" />
            <IconButton icon="notifications" />
            <IconButton icon="settings" />
          </div>
          <button type="button" className="deploy-button" onClick={toggleConsole}>
            Launch Board
          </button>
          <div className="avatar-badge">UC</div>
        </div>
      </nav>

      {activeView === "simulation" ? (
        <SimulationView
          agentMeta={AGENT_META}
          agentDefinitionsMap={agentDefinitionsMap}
          result={result}
          loading={loading}
          activeTypingAgent={activeTypingAgent}
          speakingAgent={speakingAgent}
          groupedConversation={groupedConversation}
          topConflictByRound={topConflictByRound}
          displayedRounds={displayedRounds}
          currentRound={currentRound}
          scenarioTitle={scenarioTitle}
          highestRisk={highestRisk}
          recommendedDirective={recommendedDirective}
          actionPlan={result?.actions}
          explainability={result?.explainability}
          memorySummary={result?.memory_summary}
          scenarioResults={result?.scenario_results ?? []}
          validation={result?.validation}
          onToggleConsole={toggleConsole}
          onApplySample={applySample}
        />
      ) : (
        <div className="command-shell">
          <aside className="command-side-nav">
            <div className="side-nav-header">
              <div className="side-nav-badge">
                <span className="material-symbols-outlined">memory</span>
              </div>
              <div>
                <strong>COMMAND_01</strong>
                <span>ACTIVE_SIMULATION</span>
              </div>
            </div>

            <nav className="side-nav-links">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={activeView === item.id ? "side-nav-link active" : "side-nav-link"}
                  onClick={() => setActiveView(item.id)}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="side-nav-footer">
              <button type="button" className="side-nav-deploy" onClick={toggleConsole}>
                Deploy Agent
              </button>
              <button type="button" className="side-nav-utility">
                <span className="material-symbols-outlined">contact_support</span>
                Support
              </button>
              <button type="button" className="side-nav-utility">
                <span className="material-symbols-outlined">memory</span>
                Diagnostics
              </button>
            </div>
          </aside>

          <div className="command-main">
            {activeView === "intelligence" ? (
              <IntelligenceView
                scenarioTitle={scenarioTitle}
                loading={loading}
                intelligenceMetrics={intelligenceMetrics}
                semanticStream={semanticStream}
                timelinePoints={timelinePoints}
                agentTelemetry={agentCards}
              />
            ) : null}

            {activeView === "agents" ? (
              <AgentsView agentCards={agentCards} loading={loading} matrixStats={matrixStats} />
            ) : null}

            {activeView === "risk" ? <RiskView riskMetrics={riskMetrics} riskAlerts={riskAlerts} /> : null}
          </div>
        </div>
      )}

      <CommandConsoleDrawer
        consoleOpen={consoleOpen}
        form={form}
        loading={loading}
        error={error}
        onClose={() => setConsoleOpen(false)}
        onSubmit={handleSubmit}
        onApplySample={applySample}
        onFieldChange={updateFormField}
      />
    </div>
  );
}

function IconButton({ icon }) {
  return (
    <button type="button" className="icon-button">
      <span className="material-symbols-outlined">{icon}</span>
    </button>
  );
}

function buildIntelligenceMetrics({ result, loading }) {
  const confidence = result?.final_output?.confidence ?? 84;
  const conflicts = result?.conflicts?.length ?? 2;
  const turns = result?.conversation?.length ?? 12;
  const scenarioCount = result?.scenario_results?.length ?? 2;

  return {
    throughput: (turns * 11.9 + scenarioCount * 7.2).toFixed(1),
    accuracy: Math.min(99.98, 72 + confidence * 0.28).toFixed(2),
    activeAgents: result?.agent_definitions?.length ?? Object.keys(AGENT_META).length,
    riskVector: (conflicts * 0.02 + scenarioCount * 0.01 + (loading ? 0.03 : 0.01)).toFixed(2),
    latency: loading ? "18MS" : "14MS",
    activeNodes: 1320 + turns * 9 + scenarioCount * 18,
    bottlenecks: Math.max(0, conflicts - 1),
    systemLoad: `${Math.min(92, 18 + turns * 2 + scenarioCount * 3)}%`,
    sparkline: ["32%", "54%", "68%", "41%", "76%", "82%", "58%", "29%", "72%", "38%"],
  };
}

function buildSemanticStream({ result }) {
  const conflicts = (result?.conflicts ?? []).slice(0, 2).map((conflict, index) => ({
    id: `conflict-${index}`,
    label: `Conflict_R${conflict.round}`,
    timestamp: `R${conflict.round} · BOARD`,
    tone: "danger",
    message: conflict.description,
  }));

  const turns = (result?.conversation ?? []).slice(-5).reverse().map((turn, index) => ({
    id: `turn-${index}`,
    label: (AGENT_META[turn.agent_name] ?? AGENT_META["CEO Agent"]).label,
    timestamp: `R${turn.round} · ${turn.confidence}%`,
    tone: toneFromStance(turn.stance),
    message: truncate(turn.message, 126),
  }));

  if (conflicts.length || turns.length) {
    return [...conflicts, ...turns].slice(0, 5);
  }

  return [
    {
      id: "semantic-1",
      label: "Process_9912",
      timestamp: "12:04:22:01",
      tone: "success",
      message: "Cross-referencing market volatility vectors with recent executive sentiment shifts.",
    },
    {
      id: "semantic-2",
      label: "Override_001",
      timestamp: "12:04:21:58",
      tone: "accent",
      message: "Risk mitigation protocol triggered in the finance domain. Adjusting hedge ratios.",
    },
    {
      id: "semantic-3",
      label: "System_Sync",
      timestamp: "12:04:20:44",
      tone: "neutral",
      message: "Agent mesh is waiting for the next scenario and current board context is cached.",
    },
    {
      id: "semantic-4",
      label: "Process_9913",
      timestamp: "12:04:18:21",
      tone: "success",
      message: "Analyzing semantic clusters in global trade discourse. Probability shift +0.02.",
    },
    {
      id: "semantic-5",
      label: "Marketing_Feed",
      timestamp: "12:04:15:02",
      tone: "tertiary",
      message: "Competitor narrative patterns detected. Campaign efficiency is currently above baseline.",
    },
  ];
}

function buildInferenceTimeline({ result, timeline }) {
  const roundSummaries = timeline.map((entry, index) => {
    const confidence = average(
      (result?.conversation ?? [])
        .filter((turn) => turn.round === entry.round)
        .map((turn) => Number(turn.confidence)),
      62 + index * 8,
    );

    return {
      label: `R0${entry.round}`,
      predicted: Math.max(20, Math.min(90, Math.round(confidence - 8 + index * 4))),
      actual: Math.max(22, Math.min(95, Math.round(confidence + index * 2))),
    };
  });

  while (roundSummaries.length < 5) {
    const index = roundSummaries.length;
    roundSummaries.push({
      label: ["06:00", "10:00", "14:00", "18:00", "22:00"][index] ?? `T${index + 1}`,
      predicted: 28 + index * 10,
      actual: 36 + index * 9,
    });
  }

  return roundSummaries.slice(0, 5);
}

function buildAgentCards({ result, agentDefinitionsMap, speakingAgent, loading }) {
  return Object.entries(AGENT_META).map(([name, meta], index) => {
    const turns = (result?.conversation ?? []).filter((turn) => turn.agent_name === name);
    const avgConfidence = average(turns.map((turn) => Number(turn.confidence)), 76 + index);
    const cardProfile = getAgentProfile(name, meta);
    const isSpeaking = name === speakingAgent;
    const healthValue = clamp(74 + avgConfidence * 0.24 + turns.length * 1.8, 76, 99.9);
    const loadValue = clamp(10 + turns.length * 12.4 + avgConfidence / 5, 12, 94.2);
    const historyBars = [34, 56, 41, 74, 52].map(
      (base, barIndex) => `${Math.max(18, Math.min(100, base + index * 2 - barIndex * 3))}%`,
    );

    return {
      name,
      accent: meta.accent,
      symbol: meta.symbol,
      label: meta.label,
      role: agentDefinitionsMap[name]?.role ?? meta.boardRole,
      badgeLabel: cardProfile.badgeLabel,
      badgeValue: isSpeaking && !loading ? "SPEAKING" : cardProfile.badgeValue(avgConfidence, turns.length),
      health: `${healthValue.toFixed(1)}%`,
      load: `${loadValue.toFixed(1)} Tflops`,
      historyLabel: cardProfile.historyLabel,
      historyBars,
      status: isSpeaking ? "Live Directive Channel" : cardProfile.status(turns, avgConfidence),
      footerIcon: isSpeaking ? "settings_motion_mode" : cardProfile.footerIcon,
      visualIcon: cardProfile.visualIcon,
      visualLabel: cardProfile.visualLabel,
      tone: cardProfile.tone,
    };
  });
}

function buildMatrixStats({ result, loading }) {
  const conflicts = result?.conflicts?.length ?? 1;

  return {
    networkLoad: `${Math.min(96, 62 + conflicts * 8).toFixed(1)}%`,
    performanceBars: ["40%", "60%", "45%", "80%", "95%", "65%", "50%", "75%", "40%", "60%"],
    overrides: [
      { label: "Deep Simulation Mode", detail: "Full Recursive Learning", enabled: true, tone: "accent" },
      { label: "Legacy Protocol", detail: "Deterministic Processing", enabled: false, tone: "neutral" },
      {
        label: "Neural Firewall",
        detail: loading ? "Isolation Warming" : "Active Isolation",
        enabled: true,
        tone: "danger",
      },
    ],
  };
}

function buildRiskAlerts({ result }) {
  const risks = (result?.final_output?.risks ?? []).slice(0, 3).map((risk, index) => ({
    id: `risk-${index}`,
    timestamp: `R${index + 1} · UTC`,
    severity: "Severity: High",
    title: truncate(risk, 48),
    body: risk,
    tone: "danger",
  }));

  const conflicts = (result?.conflicts ?? []).slice(0, 2).map((conflict, index) => ({
    id: `conflict-risk-${index}`,
    timestamp: `R${conflict.round} · UTC`,
    severity: "Observation",
    title: conflict.topic ?? `Contradiction in round ${conflict.round}`,
    body: conflict.description,
    tone: "accent",
  }));

  if (risks.length || conflicts.length) {
    return [...risks, ...conflicts].slice(0, 5);
  }

  return [
    {
      id: "alert-1",
      timestamp: "14:22:01 UTC",
      severity: "Severity: High",
      title: "Sudden Liquidity Drain in Sector-7G",
      body: "System detected unusual capital flight patterns resembling Black Swan precursor Alpha.",
      tone: "danger",
    },
    {
      id: "alert-2",
      timestamp: "14:18:45 UTC",
      severity: "Observation",
      title: "Neural Drift in Agent Specter",
      body: "Risk simulation agent is reporting 4.2% deviance from core directive parameters.",
      tone: "accent",
    },
    {
      id: "alert-3",
      timestamp: "14:05:12 UTC",
      severity: "Stable",
      title: "Finance Node Sync Complete",
      body: "All regional finance ledgers synchronized. Consensus reached in 12ms.",
      tone: "success",
    },
    {
      id: "alert-4",
      timestamp: "13:58:22 UTC",
      severity: "Severity: High",
      title: "Atmospheric Volatility Spike",
      body: "Predictive models indicate high probability of supply chain fracture in Zone-B.",
      tone: "danger",
    },
  ];
}

function buildRiskMetrics({ result, highestRisk }) {
  const conflicts = result?.conflicts?.length ?? 2;
  const stability = clamp(91 - conflicts * 3.2 - (result?.final_output?.confidence ? 0 : 2), 64, 96);

  return {
    globalIndex: stability.toFixed(2),
    delta: conflicts > 1 ? "▼ 1.4%" : "▲ 0.6%",
    activeThreat: formatRiskLabel(highestRisk, 24),
    observation: formatRiskLabel(result?.conflicts?.[0]?.topic ?? "AS PAC VOLATILITY", 24),
    stats: [
      { label: "Max Drift", value: `${(conflicts * 3.1 + 6.2).toFixed(1)}%` },
      { label: "Avg Latency", value: `${12 + conflicts * 2}ms` },
      { label: "Node Load", value: conflicts > 2 ? "WATCH" : "OPTIMAL", tone: "success" },
      { label: "Shock Resist", value: (98.2 - conflicts * 0.8).toFixed(1) },
    ],
    indicators: [
      { label: "Signal Integrity", value: `${(99.98 - conflicts * 0.12).toFixed(2)}%`, tone: "primary" },
      { label: "Threat Velocity", value: `${(1.2 + conflicts * 0.14).toFixed(1)}m/s`, tone: "danger" },
      { label: "Mitigation Rate", value: `${(94.1 - conflicts * 1.4).toFixed(1)}%`, tone: "success" },
      { label: "Quantum Entropy", value: `Δ ${(0.003 + conflicts * 0.001).toFixed(3)}`, tone: "tertiary" },
    ],
  };
}

function getAgentProfile(name, meta) {
  switch (name) {
    case "CEO Agent":
      return {
        badgeLabel: "Uptime",
        badgeValue: () => "99.99%",
        historyLabel: "History",
        status: () => "Core Module Active",
        footerIcon: "settings_motion_mode",
        visualIcon: "radar",
        visualLabel: "Decision Bias",
        tone: "gold",
      };
    case "Finance Agent":
      return {
        badgeLabel: "Throughput",
        badgeValue: (_, turns) => `${Math.max(1.4, turns * 0.8 + 1.6).toFixed(1)}M/s`,
        historyLabel: "Market Sync",
        status: () => "Transaction Ready",
        footerIcon: "check_circle",
        visualIcon: "analytics",
        visualLabel: "Arbitrage Delta",
        tone: "success",
      };
    case "Risk Agent":
      return {
        badgeLabel: "Threats",
        badgeValue: () => "ACTIVE_SCAN",
        historyLabel: "Attack Vector",
        status: () => "Anomaly Detected",
        footerIcon: "warning",
        visualIcon: "crisis_alert",
        visualLabel: "Stability Index",
        tone: "danger",
      };
    case "Marketing Agent":
      return {
        badgeLabel: "Sentiment",
        badgeValue: (confidence) => `+${Math.round(confidence / 2)}%`,
        historyLabel: "Reach_Index",
        status: () => "Campaign Syncing",
        footerIcon: "sync",
        visualIcon: "hub",
        visualLabel: "Node Coverage",
        tone: "tertiary",
      };
    default:
      return {
        badgeLabel: "Confidence",
        badgeValue: (confidence) => `${Math.round(confidence)}%`,
        historyLabel: "Activity",
        status: () => `${meta.boardRole} Active`,
        footerIcon: "trending_up",
        visualIcon: meta.symbol,
        visualLabel: "Ops View",
        tone: "primary",
      };
  }
}

function toneFromStance(stance) {
  if (stance === "NO GO") {
    return "danger";
  }
  if (stance === "MODIFY") {
    return "accent";
  }
  if (stance === "GO") {
    return "success";
  }
  return "neutral";
}

function average(values, fallback) {
  if (!values.length) {
    return fallback;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function truncate(value, max) {
  if (!value || value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
}

function formatRiskLabel(value, max) {
  const clean = truncate((value ?? "").replaceAll("_", " ").replace(/[.]/g, "").trim(), max);
  return clean
    .split(" ")
    .filter(Boolean)
    .map((part) => part.toUpperCase())
    .join(" ");
}

function splitList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildScenarioVariations(form) {
  if (!form.variation_name.trim()) {
    return [];
  }

  return [
    {
      scenario: form.variation_name.trim(),
      budget_change_pct: Number(form.variation_budget_change_pct || 0),
      market_condition: form.variation_market_condition || "base",
      competition_level: form.variation_competition_level || "medium",
      pricing_change_pct: Number(form.variation_pricing_change_pct || 0),
      notes: form.variation_notes.trim(),
    },
  ];
}

function createEmptyResult(companyName) {
  return {
    company_name: companyName,
    agent_definitions: [],
    conversation: [],
    round_summaries: [],
    conflicts: [],
    final_output: null,
    actions: null,
    scenario_results: [],
    explainability: null,
    memory_summary: null,
    validation: null,
  };
}

function mergeStreamEvent(current, eventPayload) {
  switch (eventPayload.type) {
    case "turn":
      return {
        ...current,
        conversation: [...(current.conversation ?? []), eventPayload.turn],
      };
    case "round_completed":
      return {
        ...current,
        conflicts: [...(current.conflicts ?? []), ...(eventPayload.conflicts ?? [])],
        round_summaries: [...(current.round_summaries ?? []), eventPayload.summary].filter(Boolean),
      };
    case "base_decision":
      return {
        ...current,
        final_output: eventPayload.final_output,
        actions: eventPayload.actions,
        explainability: eventPayload.explainability,
        memory_summary: eventPayload.memory_summary,
      };
    case "scenario_complete":
      return {
        ...current,
        scenario_results: [...(current.scenario_results ?? []), eventPayload.scenario_result],
      };
    default:
      return current;
  }
}

function buildDefaultForm() {
  return {
    company_name: "HelixOps AI",
    industry: "AI workflow SaaS",
    region: "North America",
    company_stage: "Seed",
    business_problem: sampleProblem,
    objectives: "Validate healthcare expansion, protect runway, design a realistic go-to-market plan",
    current_constraints: "11 months runway, compliance complexity, lean sales team, limited implementation bandwidth",
    runway_months: "11",
    gross_margin: "68",
    cac_payback_months: "15",
    price_point: "28000",
    variation_name: "Healthcare Downside Shock",
    variation_budget_change_pct: "-20",
    variation_market_condition: "bearish",
    variation_competition_level: "high",
    variation_pricing_change_pct: "-10",
    variation_notes: "Stress test the plan under tighter budgets and stronger incumbents.",
  };
}

export default App;
