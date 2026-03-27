import { useEffect, useMemo, useState } from "react";
import CommandConsoleDrawer from "./components/CommandConsoleDrawer";
import { AGENT_META, API_BASE, DEMO_CASES, NAV_ITEMS, defaultTimeline } from "./dashboardData";
import { formatDecisionLabel, toPlainText } from "./plainLanguage";
import AgentsView from "./views/AgentsView";
import IntelligenceView from "./views/IntelligenceView";
import RiskView from "./views/RiskView";
import SimulationView from "./views/SimulationView";

function App() {
  const [activeView, setActiveView] = useState("simulation");
  const [form, setForm] = useState(buildDefaultForm());
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typingIndex, setTypingIndex] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedDemoCaseId, setSelectedDemoCaseId] = useState(DEMO_CASES[0]?.id ?? "");
  const [selectedAgentName, setSelectedAgentName] = useState("CEO Agent");
  const [focusedAgentNames, setFocusedAgentNames] = useState([]);
  const [utilityPanel, setUtilityPanel] = useState("");

  useEffect(() => {
    if (!loading) {
      return undefined;
    }

    const names = focusedAgentNames.length ? focusedAgentNames : Object.keys(AGENT_META);
    const timer = window.setInterval(() => {
      setTypingIndex((current) => (current + 1) % names.length);
    }, 550);

    return () => window.clearInterval(timer);
  }, [loading, focusedAgentNames]);

  const availableTypingAgents = focusedAgentNames.length ? focusedAgentNames : Object.keys(AGENT_META);

  const groupedConversation = useMemo(() => {
    const grouped = new Map();
    (result?.conversation ?? []).forEach((turn) => {
      const existing = grouped.get(turn.round) ?? [];
      existing.push(turn);
      grouped.set(turn.round, existing);
    });

    return Array.from(grouped.entries()).sort(([left], [right]) => Number(left) - Number(right));
  }, [result]);

  const conversation = result?.conversation ?? [];
  const timeline = result?.round_summaries?.length ? result.round_summaries : defaultTimeline;
  const activeTypingAgent = availableTypingAgents[typingIndex % availableTypingAgents.length];
  const lastTurn = conversation[conversation.length - 1] ?? null;
  const speakingAgent = loading ? activeTypingAgent : lastTurn?.agent_name ?? "CEO Agent";
  const displayedRounds = result?.round_summaries?.length || 3;
  const currentRound = loading ? Math.min(3, Math.floor((typingIndex / 3) % 3) + 1) : lastTurn?.round ?? 0;
  const scenarioTitle = result?.company_name || form.company_name || "Business decision review";
  const highestRisk = result?.final_output?.risks?.[0] ?? "Waiting for the team to review the case.";
  const recommendedDirective =
    result?.final_output?.recommended_actions?.[0] ??
    result?.actions?.execution_plan?.[0]?.step ??
    "Waiting for a recommendation.";

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
  const agentCards = useMemo(() => buildAgentCards({ result, speakingAgent, loading }), [result, speakingAgent, loading]);
  const matrixStats = useMemo(() => buildMatrixStats({ result, loading }), [result, loading]);
  const riskAlerts = useMemo(() => buildRiskAlerts({ result }), [result]);
  const riskMetrics = useMemo(() => buildRiskMetrics({ result, highestRisk }), [result, highestRisk]);
  const selectedAgentCard = useMemo(
    () => agentCards.find((agent) => agent.name === selectedAgentName) ?? agentCards[0] ?? null,
    [agentCards, selectedAgentName],
  );

  async function runAnalysis(payload, options = {}) {
    const { closeConsole = false, focusAgentNames = [] } = options;
    if (closeConsole) {
      setConsoleOpen(false);
    }
    setLoading(true);
    setError("");
    setActiveView("simulation");
    setFocusedAgentNames(focusAgentNames);
    setSelectedAgentName(focusAgentNames[0] || "CEO Agent");

    try {
      setResult(createEmptyResult(payload.company_name));
      try {
        await runStreamingAnalysis(payload);
      } catch (streamError) {
        console.warn("Streaming analysis failed, falling back to regular analysis.", streamError);
        setResult(createEmptyResult(payload.company_name));
        await wait(800);
        await runRegularAnalysis(payload);
      }
    } catch (submissionError) {
      const rawMessage = submissionError?.message || "Unable to analyze the business problem.";
      const friendlyMessage =
        /failed to fetch|networkerror|load failed|unable to connect/i.test(rawMessage)
          ? "We could not reach the advisory service just now. Please wait a few seconds and try again."
          : rawMessage;
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  }

  async function runStreamingAnalysis(payload) {
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
        setResult((current) => mergeStreamEvent(current ?? createEmptyResult(payload.company_name), payloadLine));
      }
    }
  }

  async function runRegularAnalysis(payload) {
    const response = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const nextResult = await response.json();
    setResult(nextResult);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const normalizedForm = normalizeForm(form);
    const formChatMessages = normalizedForm.business_problem.trim()
      ? [createChatMessage(normalizedForm.business_problem.trim())]
      : [];

    const problemText = composeBusinessProblem(normalizedForm).trim();
    if (problemText.length < 20) {
      setError("Please describe the business decision in a little more detail before starting the review.");
      return;
    }

    setForm(normalizedForm);
    setChatMessages(formChatMessages);
    setChatDraft("");
    setFocusedAgentNames([]);
    await runAnalysis(buildAnalysisPayload(normalizedForm), { closeConsole: true });
  }

  async function handleQuickChatSubmit(rawMessage) {
    const trimmedMessage = rawMessage.trim();
    if (trimmedMessage.length < 20) {
      setError("Please type at least one full sentence so the advisors have enough context to review your case.");
      return;
    }

    const nextMessages = [...chatMessages, createChatMessage(trimmedMessage, focusedAgentNames)];
    const derivedForm = deriveFormFromChat(form, nextMessages);

    setChatMessages(nextMessages);
    setChatDraft("");
    setForm(derivedForm);

    await runAnalysis(buildAnalysisPayload(derivedForm, nextMessages), {
      focusAgentNames: focusedAgentNames,
    });
  }

  function applySample(sampleId = selectedDemoCaseId) {
    const sampleForm = buildSampleForm(sampleId);
    setSelectedDemoCaseId(sampleId);
    setForm(sampleForm);
    setChatDraft(sampleForm.business_problem);
    setChatMessages([createChatMessage(sampleForm.business_problem)]);
    setFocusedAgentNames([]);
    setError("");
    setActiveView("simulation");
  }

  function updateFormField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleConsole() {
    setConsoleOpen((current) => !current);
  }

  function openAgentProfile(agentName) {
    setSelectedAgentName(agentName);
    setActiveView("agents");
  }

  function openAgentConversation(agentName) {
    const nextFocusedAgents = focusedAgentNames.includes(agentName)
      ? focusedAgentNames.filter((name) => name !== agentName)
      : [...focusedAgentNames, agentName];
    setSelectedAgentName(agentName);
    setFocusedAgentNames(nextFocusedAgents);
    setActiveView("simulation");
  }

  function clearAgentConversation() {
    setFocusedAgentNames([]);
  }

  function toggleFocusedAgent(agentName) {
    if (!agentName) {
      setFocusedAgentNames([]);
      return;
    }

    setSelectedAgentName(agentName);
    setFocusedAgentNames((current) => {
      if (current.includes(agentName)) {
        return current.filter((name) => name !== agentName);
      }
      return [...current, agentName];
    });
  }

  function selectOnlyFocusedAgent(agentName) {
    if (!agentName) {
      setFocusedAgentNames([]);
    } else {
      setSelectedAgentName(agentName);
      setFocusedAgentNames([agentName]);
    }
  }

  function openHelpPanel() {
    setUtilityPanel("help");
  }

  function openStatusPanel() {
    setUtilityPanel("status");
  }

  return (
    <div className={`obsidian-app app-view-${activeView}`}>
      <nav className="obsidian-nav global-nav">
        <div className="nav-left">
          <span className="brand">BUSINESS AGENT</span>
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
              placeholder="Search"
              aria-label="Search page content"
            />
          </div>
          <div className="live-pill">
            <span className="status-dot" />
            <span>LIVE ANALYSIS</span>
          </div>
          <div className="nav-icon-row">
            <IconButton icon="account_tree" onClick={() => setActiveView("agents")} label="Open team page" />
            <IconButton icon="notifications" onClick={() => setActiveView("intelligence")} label="Open overview page" />
            <IconButton icon="settings" onClick={openStatusPanel} label="Open system status" />
          </div>
          <button type="button" className="deploy-button" onClick={toggleConsole}>
            Start Analysis
          </button>
          <div className="avatar-badge">BA</div>
        </div>
      </nav>

      {activeView === "simulation" ? (
        <SimulationView
          agentMeta={AGENT_META}
          result={result}
          loading={loading}
          error={error}
          chatMessages={chatMessages}
          chatDraft={chatDraft}
          focusedAgentNames={focusedAgentNames}
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
          onChatDraftChange={setChatDraft}
          onSubmitChat={handleQuickChatSubmit}
          onToggleFocusedAgent={toggleFocusedAgent}
          onSelectOnlyFocusedAgent={selectOnlyFocusedAgent}
          conversationAgentNames={focusedAgentNames}
          onOpenAgentConversation={openAgentConversation}
          onOpenAgentProfile={openAgentProfile}
          onClearAgentConversation={clearAgentConversation}
        />
      ) : (
        <div className="command-shell">
          <aside className="command-side-nav">
            <div className="side-nav-header">
              <div className="side-nav-badge">
                <span className="material-symbols-outlined">memory</span>
              </div>
              <div>
                <strong>Workspace</strong>
                <span>Business decision assistant</span>
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
                Start Analysis
              </button>
              <button type="button" className="side-nav-utility" onClick={openHelpPanel}>
                <span className="material-symbols-outlined">contact_support</span>
                Help
              </button>
              <button type="button" className="side-nav-utility" onClick={openStatusPanel}>
                <span className="material-symbols-outlined">memory</span>
                System Status
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
              <AgentsView
                agentCards={agentCards}
                loading={loading}
                matrixStats={matrixStats}
                selectedAgentName={selectedAgentName}
                onSelectAgent={setSelectedAgentName}
                onOpenAgentConversation={openAgentConversation}
              />
            ) : null}

            {activeView === "risk" ? <RiskView riskMetrics={riskMetrics} riskAlerts={riskAlerts} /> : null}
          </div>
        </div>
      )}

      <CommandConsoleDrawer
        consoleOpen={consoleOpen}
        form={form}
        demoCases={DEMO_CASES}
        selectedDemoCaseId={selectedDemoCaseId}
        loading={loading}
        error={error}
        onClose={() => setConsoleOpen(false)}
        onSubmit={handleSubmit}
        onApplySample={applySample}
        onSelectDemoCase={setSelectedDemoCaseId}
        onFieldChange={updateFormField}
      />

      {utilityPanel ? (
        <UtilityPanel
          mode={utilityPanel}
          activeView={activeView}
          loading={loading}
          conversationAgentNames={focusedAgentNames}
          selectedAgentCard={selectedAgentCard}
          onClose={() => setUtilityPanel("")}
          onOpenForm={() => {
            setUtilityPanel("");
            setConsoleOpen(true);
          }}
        />
      ) : null}
    </div>
  );
}

function IconButton({ icon, onClick, label }) {
  return (
    <button type="button" className="icon-button" onClick={onClick} aria-label={label}>
      <span className="material-symbols-outlined">{icon}</span>
    </button>
  );
}

function UtilityPanel({ mode, activeView, loading, conversationAgentNames, selectedAgentCard, onClose, onOpenForm }) {
  const isHelp = mode === "help";

  return (
    <div className="utility-overlay" role="dialog" aria-modal="true">
      <div className="utility-panel panel">
        <div className="panel-topline">
          <div>
            <h2>{isHelp ? "Help" : "System Status"}</h2>
            <p>
              {isHelp
                ? "Simple guidance for using the advisory system."
                : "A quick summary of what the app is doing right now."}
            </p>
          </div>
          <button type="button" className="secondary-action" onClick={onClose}>
            Close
          </button>
        </div>

        {isHelp ? (
          <div className="utility-grid">
            <article className="utility-card">
              <h3>1. Start with a message or the form</h3>
              <p>Type your business question directly on the Discussion page, or open the form if you want to add more detail.</p>
            </article>
            <article className="utility-card">
              <h3>2. Open one advisor at a time</h3>
              <p>On the Discussion page, click advisors on the left to show only their replies. Click more than one to compare them side by side.</p>
            </article>
            <article className="utility-card">
              <h3>3. Compare the final answer</h3>
              <p>Use Overview, Team, and Risks to understand why the team made its recommendation.</p>
            </article>
            <article className="utility-card">
              <h3>Need a quick start?</h3>
              <button type="button" className="wide-secondary" onClick={onOpenForm}>
                Open the input form
              </button>
            </article>
          </div>
        ) : (
          <div className="utility-grid">
            <article className="utility-card">
              <h3>Current page</h3>
              <p>{activeView === "simulation" ? "Discussion" : activeView === "intelligence" ? "Overview" : activeView === "agents" ? "Team" : "Risks"}</p>
            </article>
            <article className="utility-card">
              <h3>Review state</h3>
              <p>{loading ? "The advisory team is actively reviewing the case." : "The team is idle and ready for a new case."}</p>
            </article>
            <article className="utility-card">
              <h3>Advisor conversation</h3>
              <p>
                {conversationAgentNames.length
                  ? `${conversationAgentNames.length === 1 ? selectedAgentCard?.label ?? conversationAgentNames[0] : `${conversationAgentNames.length} advisors`} selected in the Discussion view.`
                  : "All advisor messages are currently visible together."}
              </p>
            </article>
            <article className="utility-card">
              <h3>Backend connection</h3>
              <p>{API_BASE}</p>
            </article>
          </div>
        )}
      </div>
    </div>
  );
}

function buildIntelligenceMetrics({ result, loading }) {
  const confidence = result?.final_output?.confidence ?? 84;
  const conflicts = result?.conflicts?.length ?? 2;
  const turns = result?.conversation?.length ?? 12;
  const scenarioCount = result?.scenario_results?.length ?? 2;

  return {
    throughput: Math.round(turns + scenarioCount * 2),
    accuracy: Math.min(99.98, 72 + confidence * 0.28).toFixed(0),
    activeAgents: result?.agent_definitions?.length ?? Object.keys(AGENT_META).length,
    riskVector: result?.conflicts?.length ?? 0,
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
    label: `Disagreement ${conflict.round}`,
    timestamp: `Round ${conflict.round}`,
    tone: "danger",
    message: toPlainText(conflict.description),
  }));

  const turns = (result?.conversation ?? []).slice(-5).reverse().map((turn, index) => ({
    id: `turn-${index}`,
    label: (AGENT_META[turn.agent_name] ?? AGENT_META["CEO Agent"]).label,
    timestamp: `Round ${turn.round} - ${turn.confidence}% confidence`,
    tone: toneFromStance(turn.stance),
    message: truncate(toPlainText(turn.message), 126),
  }));

  if (conflicts.length || turns.length) {
    return [...conflicts, ...turns].slice(0, 5);
  }

  return [
    {
      id: "semantic-1",
      label: "Recent update",
      timestamp: "Just now",
      tone: "success",
      message: "Reviewing new market signals and recent team feedback.",
    },
    {
      id: "semantic-2",
      label: "Risk update",
      timestamp: "Moments ago",
      tone: "accent",
      message: "The system found a risk worth watching and is adjusting the recommendation.",
    },
    {
      id: "semantic-3",
      label: "System sync",
      timestamp: "Moments ago",
      tone: "neutral",
      message: "The team is ready for another scenario and has saved the current discussion.",
    },
    {
      id: "semantic-4",
      label: "Market scan",
      timestamp: "A minute ago",
      tone: "success",
      message: "Looking at outside market signals and checking whether demand is changing.",
    },
    {
      id: "semantic-5",
      label: "Marketing update",
      timestamp: "A minute ago",
      tone: "tertiary",
      message: "The system found competitor messaging patterns and compared current campaign results.",
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
      label: `Round ${entry.round}`,
      predicted: Math.max(20, Math.min(90, Math.round(confidence - 8 + index * 4))),
      actual: Math.max(22, Math.min(95, Math.round(confidence + index * 2))),
    };
  });

  while (roundSummaries.length < 5) {
    const index = roundSummaries.length;
    roundSummaries.push({
      label: ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"][index] ?? `Step ${index + 1}`,
      predicted: 28 + index * 10,
      actual: 36 + index * 9,
    });
  }

  return roundSummaries.slice(0, 5);
}

function buildAgentCards({ result, speakingAgent, loading }) {
  const definitionMap = new Map((result?.agent_definitions ?? []).map((definition) => [definition.name, definition]));

  return Object.entries(AGENT_META).map(([name, meta], index) => {
    const turns = (result?.conversation ?? []).filter((turn) => turn.agent_name === name);
    const latestTurn = turns[turns.length - 1] ?? null;
    const definition = definitionMap.get(name);
    const avgConfidence = average(turns.map((turn) => Number(turn.confidence)), 76 + index);
    const cardProfile = getAgentProfile(name, meta);
    const explainer = getAgentExplainer(name);
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
      role: meta.boardRole,
      badgeLabel: cardProfile.badgeLabel,
      badgeValue: isSpeaking && !loading ? "Speaking now" : cardProfile.badgeValue(avgConfidence, turns.length),
      health: `${healthValue.toFixed(1)}%`,
      load: `${loadValue.toFixed(0)}% busy`,
      historyLabel: cardProfile.historyLabel,
      historyBars,
      status: isSpeaking ? "Currently speaking" : cardProfile.status(turns, avgConfidence),
      footerIcon: isSpeaking ? "settings_motion_mode" : cardProfile.footerIcon,
      visualIcon: cardProfile.visualIcon,
      visualLabel: cardProfile.visualLabel,
      tone: cardProfile.tone,
      shortSummary: explainer.summary,
      decisionStyle: toPlainText(definition?.decision_style ?? explainer.decisionStyle),
      focusAreas: formatAgentItems(definition?.priorities, explainer.focusAreas),
      helpingWith: formatAgentItems(definition?.goals, explainer.helpingWith),
      watchOuts: formatAgentItems(definition?.constraints, explainer.watchOuts),
      challengePattern: toPlainText(definition?.challenge_pattern ?? explainer.challengePattern),
      latestView: toPlainText(latestTurn?.message ?? explainer.defaultMessage),
      latestConfidence: latestTurn ? `${latestTurn.confidence}% confidence` : isSpeaking && loading ? "Preparing advice" : "Waiting for your case",
      latestDecision: latestTurn?.stance ? formatDecisionLabel(latestTurn.stance) : "No recommendation yet",
      latestHighlights: formatAgentItems(latestTurn?.key_points, explainer.focusAreas),
    };
  });
}

function buildMatrixStats({ result, loading }) {
  const conflicts = result?.conflicts?.length ?? 1;

  return {
    networkLoad: `${Math.min(96, 62 + conflicts * 8).toFixed(1)}%`,
    performanceBars: ["40%", "60%", "45%", "80%", "95%", "65%", "50%", "75%", "40%", "60%"],
    overrides: [
      { label: "Detailed analysis mode", detail: "Looks deeper before deciding", enabled: true, tone: "accent" },
      { label: "Simple analysis mode", detail: "Uses a lighter review process", enabled: false, tone: "neutral" },
      {
        label: "Safety guardrails",
        detail: loading ? "Warming up" : "Active",
        enabled: true,
        tone: "danger",
      },
      {
        label: "Save past cases",
        detail: "Lets the system learn from earlier analyses",
        enabled: true,
        tone: "success",
      },
      {
        label: "What-if testing",
        detail: "Runs extra scenario checks before the final answer",
        enabled: true,
        tone: "tertiary",
      },
    ],
  };
}

function buildRiskAlerts({ result }) {
  const risks = (result?.final_output?.risks ?? []).slice(0, 3).map((risk, index) => ({
    id: `risk-${index}`,
    timestamp: `Round ${index + 1}`,
    severity: "High priority",
    title: truncate(toPlainText(risk), 48),
    body: toPlainText(risk),
    tone: "danger",
  }));

  const conflicts = (result?.conflicts ?? []).slice(0, 2).map((conflict, index) => ({
    id: `conflict-risk-${index}`,
    timestamp: `Round ${conflict.round}`,
    severity: "Watch item",
    title: toPlainText(conflict.topic ?? `Disagreement in round ${conflict.round}`),
    body: toPlainText(conflict.description),
    tone: "accent",
  }));

  if (risks.length || conflicts.length) {
    return [...risks, ...conflicts].slice(0, 5);
  }

  return [
    {
      id: "alert-1",
      timestamp: "Just now",
      severity: "High priority",
      title: "Rapid cash pressure",
      body: "The system noticed unusually fast money leaving this market.",
      tone: "danger",
    },
    {
      id: "alert-2",
      timestamp: "Moments ago",
      severity: "Watch item",
      title: "Risk model changed direction",
      body: "The risk review is now more cautious than before.",
      tone: "accent",
    },
    {
      id: "alert-3",
      timestamp: "Earlier",
      severity: "Stable",
      title: "Finance review completed",
      body: "The finance checks have finished and are now part of the team decision.",
      tone: "success",
    },
    {
      id: "alert-4",
      timestamp: "Earlier",
      severity: "High priority",
      title: "Supply risk increased",
      body: "The model expects delivery problems if conditions get worse.",
      tone: "danger",
    },
  ];
}

function buildRiskMetrics({ result, highestRisk }) {
  const conflicts = result?.conflicts?.length ?? 2;
  const stability = clamp(91 - conflicts * 3.2 - (result?.final_output?.confidence ? 0 : 2), 64, 96);
  const dataConfidence = 99.98 - conflicts * 0.12;
  const readiness = 94.1 - conflicts * 1.4;
  const changeLevel = 0.003 + conflicts * 0.001;

  return {
    globalIndex: stability.toFixed(2),
    delta: conflicts > 1 ? "-1.4%" : "+0.6%",
    activeThreat: formatRiskLabel(toPlainText(highestRisk), 24),
    observation: formatRiskLabel(toPlainText(result?.conflicts?.[0]?.topic ?? "Market change"), 24),
    stats: [
      { label: "Risk change", value: `${(conflicts * 3.1 + 6.2).toFixed(1)}%` },
      { label: "Response speed", value: `${12 + conflicts * 2}ms` },
      { label: "System load", value: conflicts > 2 ? "Watch" : "Healthy", tone: "success" },
      { label: "Resilience score", value: (98.2 - conflicts * 0.8).toFixed(1) },
    ],
    indicators: [
      { label: "Data confidence", value: `${dataConfidence.toFixed(2)}%`, tone: "primary" },
      { label: "How fast risks are changing", value: describeRiskChangePace(conflicts), tone: "danger" },
      { label: "How prepared we are", value: `${readiness.toFixed(1)}%`, tone: "success" },
      { label: "Situation change", value: describeSituationChange(changeLevel), tone: "tertiary" },
    ],
  };
}

function describeRiskChangePace(conflicts) {
  if (conflicts >= 4) {
    return "Changing fast";
  }
  if (conflicts >= 2) {
    return "Changing steadily";
  }
  return "Mostly steady";
}

function describeSituationChange(changeLevel) {
  if (changeLevel >= 0.008) {
    return "Big change";
  }
  if (changeLevel >= 0.005) {
    return "Noticeable change";
  }
  return "Small change";
}

function getAgentProfile(name, meta) {
  switch (name) {
    case "CEO Agent":
      return {
        badgeLabel: "Availability",
        badgeValue: () => "99.99%",
        historyLabel: "Recent activity",
        status: () => "Leading the review",
        footerIcon: "settings_motion_mode",
        visualIcon: "radar",
        visualLabel: "Decision view",
        tone: "gold",
      };
    case "Finance Agent":
      return {
        badgeLabel: "Review speed",
        badgeValue: (_, turns) => `${Math.max(1.4, turns * 0.8 + 1.6).toFixed(1)}x`,
        historyLabel: "Recent checks",
        status: () => "Budget review ready",
        footerIcon: "check_circle",
        visualIcon: "analytics",
        visualLabel: "Budget view",
        tone: "success",
      };
    case "Risk Agent":
      return {
        badgeLabel: "Risk scan",
        badgeValue: () => "RUNNING",
        historyLabel: "Recent alerts",
        status: () => "Issue found",
        footerIcon: "warning",
        visualIcon: "crisis_alert",
        visualLabel: "Risk view",
        tone: "danger",
      };
    case "Marketing Agent":
      return {
        badgeLabel: "Audience signal",
        badgeValue: (confidence) => `+${Math.round(confidence / 2)}%`,
        historyLabel: "Recent reach",
        status: () => "Message review ready",
        footerIcon: "sync",
        visualIcon: "hub",
        visualLabel: "Audience view",
        tone: "tertiary",
      };
    default:
      return {
        badgeLabel: "Confidence",
        badgeValue: (confidence) => `${Math.round(confidence)}%`,
        historyLabel: "Recent activity",
        status: () => `${meta.boardRole} ready`,
        footerIcon: "trending_up",
        visualIcon: meta.symbol,
        visualLabel: "Quick view",
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

  return `${value.slice(0, max - 3)}...`;
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

function composeBusinessProblem(form, chatMessages = []) {
  if (chatMessages.length) {
    const transcript = chatMessages
      .map((message, index) => {
        const recipient = message.targetAgentNames?.length
          ? ` to ${message.targetAgentNames.join(", ")}`
          : " to the full advisory team";
        return `Message ${index + 1}${recipient}: ${message.content.trim()}`;
      })
      .join("\n");
    const sections = [`Conversation with the user:\n${transcript}`];
    if (form.extra_context.trim()) {
      sections.push(`Additional background: ${form.extra_context.trim()}`);
    }
    return sections.join("\n\n");
  }

  const mainProblem = form.business_problem.trim();
  const extraContext = form.extra_context.trim();

  if (!extraContext) {
    return mainProblem;
  }

  return `${mainProblem}\n\nAdditional background: ${extraContext}`;
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

function createChatMessage(content, targetAgentNames = []) {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content,
    targetAgentNames,
    timestamp: new Date().toISOString(),
  };
}

function buildAnalysisPayload(form, chatMessages = []) {
  const normalizedForm = normalizeForm(form);

  return {
    company_name: normalizedForm.company_name,
    industry: normalizedForm.industry,
    region: normalizedForm.region,
    company_stage: normalizedForm.company_stage,
    selected_agent_names: chatMessages[chatMessages.length - 1]?.targetAgentNames ?? [],
    business_problem: composeBusinessProblem(normalizedForm, chatMessages),
    objectives: splitList(normalizedForm.objectives),
    current_constraints: splitList(normalizedForm.current_constraints),
    known_metrics: buildKnownMetrics(normalizedForm),
    scenario_variations: buildScenarioVariations(normalizedForm),
  };
}

function buildKnownMetrics(form) {
  return compactObject({
    runway_months: numericValue(form.runway_months),
    gross_margin: numericValue(form.gross_margin),
    cac_payback_months: numericValue(form.cac_payback_months),
    price_point: numericValue(form.price_point),
  });
}

function normalizeForm(form) {
  return {
    ...form,
    company_name: form.company_name.trim() || "Your business case",
    industry: form.industry.trim() || "General business",
    region: form.region || "Global",
    company_stage: form.company_stage || "Idea",
  };
}

function deriveFormFromChat(currentForm, chatMessages) {
  const latestMessage = chatMessages[chatMessages.length - 1]?.content ?? "";
  const extracted = extractChatClues(latestMessage);

  return {
    ...currentForm,
    company_name: currentForm.company_name.trim() || "Your business case",
    industry: currentForm.industry.trim() || "General business",
    region: extracted.region || currentForm.region || "Global",
    company_stage: extracted.company_stage || currentForm.company_stage || "Idea",
    business_problem: latestMessage,
    runway_months: extracted.runway_months ?? currentForm.runway_months,
    gross_margin: extracted.gross_margin ?? currentForm.gross_margin,
    cac_payback_months: extracted.cac_payback_months ?? currentForm.cac_payback_months,
    price_point: extracted.price_point ?? currentForm.price_point,
  };
}

function extractChatClues(message) {
  const lower = message.toLowerCase();
  const regionMatchers = [
    ["North America", ["north america", "us", "usa", "canada"]],
    ["Europe", ["europe", "eu", "uk"]],
    ["India", ["india"]],
    ["Asia-Pacific", ["asia-pacific", "apac", "asia pacific", "australia", "singapore"]],
    ["Latin America", ["latin america", "latam"]],
    ["Middle East & Africa", ["middle east", "africa", "mea"]],
    ["Global", ["global", "worldwide", "international"]],
  ];
  const stageMatchers = [
    ["Idea", ["idea stage", "idea"]],
    ["Pre-seed", ["pre-seed", "pre seed"]],
    ["Seed", ["seed"]],
    ["Series A", ["series a"]],
    ["Series B+", ["series b", "series c", "growth stage"]],
    ["Established business", ["established", "profitable", "mature business"]],
  ];

  const runwayMatch =
    message.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?)\s+(?:of\s+)?(?:cash|runway)/i) ||
    message.match(/(?:cash|runway)[^\d]{0,12}(\d+(?:\.\d+)?)\s*(?:months?|mos?)/i);
  const marginMatch =
    message.match(/(\d+(?:\.\d+)?)\s*%\s*(?:gross\s+)?margin/i) ||
    message.match(/(?:gross\s+)?margin[^\d]{0,12}(\d+(?:\.\d+)?)\s*%/i);
  const paybackMatch =
    message.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?)\s*(?:to\s*)?(?:recover|payback)/i) ||
    message.match(/payback[^\d]{0,12}(\d+(?:\.\d+)?)\s*(?:months?|mos?)/i);
  const priceMatch =
    message.match(/[$₹€£]\s?([\d,]+(?:\.\d+)?)/) ||
    message.match(/price[^\d]{0,12}([\d,]+(?:\.\d+)?)/i);

  return {
    region: matchFirstLabel(regionMatchers, lower),
    company_stage: matchFirstLabel(stageMatchers, lower),
    runway_months: runwayMatch?.[1],
    gross_margin: marginMatch?.[1],
    cac_payback_months: paybackMatch?.[1],
    price_point: priceMatch?.[1]?.replaceAll(",", ""),
  };
}

function matchFirstLabel(options, value) {
  const match = options.find(([, aliases]) => aliases.some((alias) => value.includes(alias)));
  return match?.[0];
}

function numericValue(value) {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
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
    company_name: "",
    industry: "",
    region: "Global",
    company_stage: "Idea",
    business_problem: "",
    objectives: "",
    current_constraints: "",
    extra_context: "",
    runway_months: "",
    gross_margin: "",
    cac_payback_months: "",
    price_point: "",
    variation_name: "",
    variation_budget_change_pct: "",
    variation_market_condition: "base",
    variation_competition_level: "medium",
    variation_pricing_change_pct: "",
    variation_notes: "",
  };
}

function buildSampleForm(sampleId) {
  const selectedCase = DEMO_CASES.find((item) => item.id === sampleId) ?? DEMO_CASES[0];
  return {
    ...selectedCase.form,
  };
}

function formatAgentItems(items, fallback) {
  const cleaned = (items ?? []).map((item) => toPlainText(item)).filter(Boolean);
  return cleaned.length ? cleaned.slice(0, 4) : fallback;
}

function getAgentExplainer(name) {
  switch (name) {
    case "CEO Agent":
      return {
        summary: "Looks at the full picture and makes the final call.",
        decisionStyle: "Strategic and balanced",
        focusAreas: ["Overall trade-offs", "Whether the company can truly execute", "How much risk is worth taking"],
        helpingWith: ["Making the final choice", "Balancing upside and downside", "Turning team advice into one plan"],
        watchOuts: ["Large avoidable risks", "Plans that are too vague to execute", "Disagreements the team has not settled"],
        challengePattern: "Pushes optimistic people to prove the upside and cautious people to explain the cost of waiting.",
        defaultMessage: "Will combine the team's advice into one final recommendation after the review ends.",
      };
    case "Startup Builder Agent":
      return {
        summary: "Focuses on moving fast and learning quickly without overbuilding.",
        decisionStyle: "Fast-moving and practical",
        focusAreas: ["Speed to market", "Simple first launch scope", "Fast customer learning"],
        helpingWith: ["Choosing a small first version", "Finding the fastest path to traction", "Avoiding unnecessary complexity"],
        watchOuts: ["Slow decision-making", "Trying to build too much at once", "Losing momentum"],
        challengePattern: "Questions plans that take too long or depend on perfect conditions before launch.",
        defaultMessage: "Wants a plan that gets to real customers quickly and learns from them fast.",
      };
    case "Market Research Agent":
      return {
        summary: "Checks whether real customers want this and whether the timing makes sense.",
        decisionStyle: "Evidence-first",
        focusAreas: ["Customer demand", "Market timing", "Who the best early buyers are"],
        helpingWith: ["Finding the best customer group", "Checking demand signals", "Comparing market opportunities"],
        watchOuts: ["Weak demand signals", "A fuzzy target customer", "Assumptions not backed by evidence"],
        challengePattern: "Pushes the team to prove there is enough demand instead of relying on big market stories.",
        defaultMessage: "Is looking for stronger evidence that customers will buy and that the timing is right.",
      };
    case "Finance Agent":
      return {
        summary: "Checks whether the plan makes financial sense and protects cash.",
        decisionStyle: "Careful and numbers-driven",
        focusAreas: ["Cash runway", "Profitability", "How long it takes to recover spending"],
        helpingWith: ["Budget planning", "Revenue assumptions", "Checking whether the plan is affordable"],
        watchOuts: ["Running out of cash", "Slow payback", "Expensive plans with weak returns"],
        challengePattern: "Pushes back when growth ideas cost too much or take too long to pay back.",
        defaultMessage: "Is testing whether the plan can work without putting the company under cash pressure.",
      };
    case "Marketing Agent":
      return {
        summary: "Looks at how to explain the product clearly and create demand.",
        decisionStyle: "Bold but practical",
        focusAreas: ["Positioning", "Channels", "Audience response"],
        helpingWith: ["Clear messaging", "Launch campaigns", "Finding the best customer channels"],
        watchOuts: ["Weak messaging", "Spending on the wrong channels", "Marketing plans built on vanity metrics"],
        challengePattern: "Questions plans that assume customers will understand the value without a strong message.",
        defaultMessage: "Is shaping how the product should be explained so the right customers pay attention.",
      };
    case "Pricing Agent":
      return {
        summary: "Checks whether the price is strong enough and still easy for customers to accept.",
        decisionStyle: "Analytical",
        focusAreas: ["Price level", "Packaging", "Customer willingness to pay"],
        helpingWith: ["Choosing the right price", "Testing discounts carefully", "Matching price to value"],
        watchOuts: ["Underpricing", "Prices that create buying friction", "Discounting too early"],
        challengePattern: "Pushes back when the price is based on guesswork instead of customer value.",
        defaultMessage: "Is comparing price, perceived value, and buying friction before recommending a move.",
      };
    case "Supply Chain Agent":
      return {
        summary: "Checks whether the company can deliver reliably after launch.",
        decisionStyle: "Operational and careful",
        focusAreas: ["Delivery readiness", "Dependencies", "Ability to scale"],
        helpingWith: ["Operations planning", "Capacity checks", "Reducing delivery failures"],
        watchOuts: ["Operational bottlenecks", "Vendor dependence", "Launching before delivery is ready"],
        challengePattern: "Questions go-to-market plans that look good on paper but overload operations.",
        defaultMessage: "Is reviewing whether the business can handle demand without delivery problems.",
      };
    case "Hiring Agent":
      return {
        summary: "Looks at whether the current team can support the plan and who to hire next.",
        decisionStyle: "Balanced and realistic",
        focusAreas: ["Team capacity", "Critical roles", "Hiring timing"],
        helpingWith: ["Hiring plans", "Team workload", "Choosing the most urgent roles first"],
        watchOuts: ["Relying on hires that are not in place yet", "Stretching a small team too thin", "Hiring too much too early"],
        challengePattern: "Pushes the team to match the plan to the people actually available to execute it.",
        defaultMessage: "Is checking whether the company has the people it needs to carry this plan successfully.",
      };
    case "Risk Agent":
      return {
        summary: "Looks for what could go wrong and how severe it might be.",
        decisionStyle: "Cautious and defensive",
        focusAreas: ["Downside scenarios", "Compliance risk", "Failure points"],
        helpingWith: ["Risk planning", "Mitigation steps", "Deciding whether the downside is acceptable"],
        watchOuts: ["Regulatory problems", "Big downside surprises", "Weak controls"],
        challengePattern: "Challenges plans that ignore low-probability but high-impact risks.",
        defaultMessage: "Is stress-testing the plan to find serious risks before the company commits.",
      };
    case "Sales Strategy Agent":
      return {
        summary: "Checks whether the company can actually win customers and close deals.",
        decisionStyle: "Practical and customer-facing",
        focusAreas: ["Sales motion", "Buyer friction", "Revenue path"],
        helpingWith: ["Sales strategy", "Buyer journey planning", "Checking whether demand can turn into revenue"],
        watchOuts: ["Long sales cycles", "Weak close rates", "Mistaking interest for real revenue"],
        challengePattern: "Pushes back when the team assumes leads will automatically turn into paying customers.",
        defaultMessage: "Is reviewing whether the offer, sales process, and target buyers line up well enough to close deals.",
      };
    default:
      return {
        summary: "Reviews the decision from a specialist point of view.",
        decisionStyle: "Balanced",
        focusAreas: ["Decision quality", "Execution readiness", "Business impact"],
        helpingWith: ["Improving the plan", "Reducing surprises", "Highlighting the most important trade-offs"],
        watchOuts: ["Weak assumptions", "Missing evidence", "Execution gaps"],
        challengePattern: "Pushes back when the plan depends on assumptions that have not been proven.",
        defaultMessage: "Will share a specialist view once the analysis starts.",
      };
  }
}

export default App;
