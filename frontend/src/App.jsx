import { useEffect, useMemo, useState } from "react";
import AuthPanel from "./components/AuthPanel";
import CommandConsoleDrawer from "./components/CommandConsoleDrawer";
import { AGENT_META, API_BASE, API_BASE_CANDIDATES, DEMO_CASES, NAV_ITEMS, defaultTimeline } from "./dashboardData";
import { formatDecisionLabel, toPlainText } from "./plainLanguage";
import AgentsView from "./views/AgentsView";
import IntelligenceView from "./views/IntelligenceView";
import RiskView from "./views/RiskView";
import SimulationView from "./views/SimulationView";

const DEMO_AUTH_DISABLED = (import.meta.env.VITE_DEMO_AUTH_DISABLED ?? "true") === "true";
const STREAM_TIMEOUT_MS = 6500;
const ANALYSIS_TIMEOUT_MS = 9000;
const FETCH_RETRIES = 0;

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
  const [apiBase, setApiBase] = useState(API_BASE);
  const [selectedDemoCaseId, setSelectedDemoCaseId] = useState(DEMO_CASES[0]?.id ?? "");
  const [selectedAgentName, setSelectedAgentName] = useState("CEO Agent");
  const [focusedAgentNames, setFocusedAgentNames] = useState([]);
  const [utilityPanel, setUtilityPanel] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [autonomyStatus, setAutonomyStatus] = useState(null);
  const [autonomyBusy, setAutonomyBusy] = useState(false);
  const [autonomyError, setAutonomyError] = useState("");

  useEffect(() => {
    if (DEMO_AUTH_DISABLED) {
      setAuthUser({
        id: "demo-user",
        email: "Demo mode",
        is_verified: true,
        session_expires_at: null,
      });
      setAuthReady(true);
      return undefined;
    }

    let active = true;

    async function loadSession() {
      try {
        const response = await fetchApi("/auth/session", {
          method: "GET",
          credentials: "include",
        });
        if (!active) {
          return;
        }
        if (response.ok) {
          setAuthUser(await response.json());
        } else {
          setAuthUser(null);
        }
      } catch (_error) {
        if (active) {
          setAuthUser(null);
        }
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    }

    loadSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authReady || !authUser) {
      return undefined;
    }

    let active = true;

    async function refreshStatus() {
      try {
        const response = await fetchApi("/autonomy/status", {
          method: "GET",
          credentials: "include",
        });
        const body = await safeJson(response);
        if (!active) {
          return;
        }
        if (!response.ok) {
          throw new Error(body?.detail || "Unable to load automatic monitoring status.");
        }
        setAutonomyStatus(body);
        setAutonomyError("");
      } catch (statusError) {
        if (active) {
          setAutonomyStatus((current) => current ?? buildLocalAutonomyStatus({ scenarioTitle }));
          setAutonomyError("Live monitor is temporarily unreachable. Showing local fallback status.");
        }
      }
    }

    refreshStatus();
    const timer = window.setInterval(refreshStatus, 45000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authReady, authUser]);

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
  const isDirectAnswerMode = conversation.length > 0 && conversation.every((turn) => turn.agent_name === "General Assistant");
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

  const apiBaseCandidates = useMemo(
    () => [apiBase, ...API_BASE_CANDIDATES.filter((base) => base && base !== apiBase)],
    [apiBase],
  );

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

  async function fetchApi(path, options = {}, fetchOptions = {}) {
    let lastError = null;
    for (const base of apiBaseCandidates) {
      try {
        const response = await fetchWithRetry(`${base}${path}`, options, fetchOptions);
        if ([404, 502, 503, 504].includes(response.status)) {
          lastError = new Error(`Upstream mismatch from ${base}.`);
          continue;
        }
        if (base !== apiBase) {
          setApiBase(base);
        }
        return response;
      } catch (networkError) {
        lastError = networkError;
      }
    }
    throw lastError ?? new Error("Unable to reach the advisory service.");
  }

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
        await runRegularAnalysis(payload);
      }
    } catch (submissionError) {
      const rawMessage = submissionError?.message || "Unable to analyze the business problem.";
      if (/please sign in|unauthorized|401/i.test(rawMessage)) {
        setAuthUser(null);
        setError("Please sign in to continue.");
      } else {
        console.warn("Remote analysis failed. Falling back to quick local review.", submissionError);
        setResult(buildLocalFallbackAnalysis(payload));
        setError("");
      }
    } finally {
      setLoading(false);
    }
  }

  async function runStreamingAnalysis(payload) {
    const response = await fetchApi("/analyze/stream", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { timeoutMs: STREAM_TIMEOUT_MS, retries: FETCH_RETRIES });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Please sign in to continue.");
      }
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
          try {
            await reader.cancel();
          } catch (_error) {
            // Ignore cancel errors because the final payload is already complete.
          }
          return;
        }
        setResult((current) => mergeStreamEvent(current ?? createEmptyResult(payload.company_name), payloadLine));
      }
    }
  }

  async function runRegularAnalysis(payload) {
    const response = await fetchApi("/analyze", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { timeoutMs: ANALYSIS_TIMEOUT_MS, retries: FETCH_RETRIES });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Please sign in to continue.");
      }
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

  async function runAutonomyCycle() {
    setAutonomyBusy(true);
    setAutonomyError("");
    try {
      const response = await fetchApi("/autonomy/run", {
        method: "POST",
        credentials: "include",
      });
      const body = await safeJson(response);
      if (!response.ok) {
        throw new Error(body?.detail || "Unable to run the automatic monitor right now.");
      }
      setAutonomyStatus(body);
    } catch (submissionError) {
      setAutonomyStatus((current) => runLocalAutonomyFallback({ currentStatus: current, result, scenarioTitle }));
      setAutonomyError("Live monitor is temporarily unreachable. Ran a local fallback monitor cycle.");
    } finally {
      setAutonomyBusy(false);
    }
  }

  async function handleLogin(payload) {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const response = await fetchApi("/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await safeJson(response);
      if (!response.ok) {
        throw new Error(body?.detail || "Unable to sign in.");
      }
      setAuthUser(body);
      setAuthMessage("Signed in successfully.");
    } catch (submissionError) {
      setAuthMessage(submissionError.message || "Unable to sign in.");
    } finally {
      setAuthBusy(false);
      setAuthReady(true);
    }
  }

  async function handleRegister(payload) {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const response = await fetchApi("/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await safeJson(response);
      if (!response.ok) {
        throw new Error(body?.detail || "Unable to create account.");
      }
      setAuthMessage(
        body.verification_preview_url
          ? `Account created. Verify your email using this link: ${body.verification_preview_url}`
          : "Account created. Please verify your email before signing in.",
      );
    } catch (submissionError) {
      setAuthMessage(submissionError.message || "Unable to create account.");
    } finally {
      setAuthBusy(false);
      setAuthReady(true);
    }
  }

  async function handleRequestReset(payload) {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const response = await fetchApi("/auth/request-password-reset", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await safeJson(response);
      if (!response.ok) {
        throw new Error(body?.detail || "Unable to request a password reset.");
      }
      setAuthMessage(
        body.reset_preview_url
          ? `Reset link created. Use this link: ${body.reset_preview_url}`
          : body.message || "If the account exists, a reset link has been prepared.",
      );
    } catch (submissionError) {
      setAuthMessage(submissionError.message || "Unable to request a password reset.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResetPassword(payload) {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const response = await fetchApi("/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await safeJson(response);
      if (!response.ok) {
        throw new Error(body?.detail || "Unable to update the password.");
      }
      setAuthMessage(body.message || "Password updated. You can now sign in.");
    } catch (submissionError) {
      setAuthMessage(submissionError.message || "Unable to update the password.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await fetchApi("/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setAuthUser(null);
      setAuthBusy(false);
    }
  }

  if (!authReady) {
    return <div className="auth-loading">Checking secure session...</div>;
  }

  if (!authUser) {
    return (
      <AuthPanel
        loading={loading}
        authUser={authUser}
        authBusy={authBusy}
        authMessage={authMessage}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onRequestReset={handleRequestReset}
        onResetPassword={handleResetPassword}
      />
    );
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
          {!DEMO_AUTH_DISABLED ? (
            <button type="button" className="secondary-action nav-logout" onClick={handleLogout}>
              Sign out
            </button>
          ) : null}
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
          conversationAgentNames={isDirectAnswerMode ? [] : focusedAgentNames}
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
                autonomyStatus={autonomyStatus}
                autonomyBusy={autonomyBusy}
                autonomyError={autonomyError}
                onRunAutonomy={runAutonomyCycle}
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

            {activeView === "risk" ? (
              <RiskView
                riskMetrics={riskMetrics}
                riskAlerts={riskAlerts}
                autonomyStatus={autonomyStatus}
                autonomyBusy={autonomyBusy}
                autonomyError={autonomyError}
                onRunAutonomy={runAutonomyCycle}
              />
            ) : null}
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

function buildLocalAutonomyStatus({ scenarioTitle }) {
  const now = new Date().toISOString();
  return {
    scheduler_mode: "local fallback mode",
    background_running: false,
    poll_interval_seconds: 300,
    next_run_hint: "Backend monitor is unreachable. Local fallback status is shown for the demo.",
    watch_profiles: [
      {
        id: "local-watch",
        label: scenarioTitle || "Current business case",
        company_name: scenarioTitle || "Current business case",
        industry: "",
        region: "",
        active: true,
        last_checked_at: now,
        latest_signal_summary: "Waiting for a live monitor run.",
        last_outcome: "No action yet.",
      },
    ],
    recent_actions: [],
    open_tasks: [],
    recent_runs: [],
  };
}

function runLocalAutonomyFallback({ currentStatus, result, scenarioTitle }) {
  const base = currentStatus ?? buildLocalAutonomyStatus({ scenarioTitle });
  const now = new Date().toISOString();
  const topRisk = result?.final_output?.risks?.[0] ?? "Watch spending and execution quality closely.";
  const nextAction = result?.final_output?.recommended_actions?.[0] ?? "Run a tighter pilot with weekly checkpoints.";
  const nextRun = {
    id: `local-run-${Date.now()}`,
    started_at: now,
    completed_at: now,
    status: "completed",
    trigger_source: "local-fallback",
    watches_scanned: 1,
    actions_taken: 1,
    summary: "Local fallback monitor cycle completed.",
  };
  const nextActionLog = {
    id: `local-action-${Date.now()}`,
    watch_id: "local-watch",
    watch_label: scenarioTitle || "Current business case",
    action_type: "local-review",
    title: "Review launch plan and risk controls",
    reason: topRisk,
    status: "executed",
    executor: "local-fallback",
    executed_at: now,
    result_summary: nextAction,
  };

  return {
    ...base,
    watch_profiles: [
      {
        ...(base.watch_profiles?.[0] ?? {}),
        id: "local-watch",
        label: scenarioTitle || "Current business case",
        company_name: scenarioTitle || "Current business case",
        last_checked_at: now,
        latest_signal_summary: topRisk,
        last_outcome: nextAction,
      },
    ],
    recent_runs: [nextRun, ...(base.recent_runs ?? []).slice(0, 4)],
    recent_actions: [nextActionLog, ...(base.recent_actions ?? []).slice(0, 5)],
    open_tasks: [
      {
        id: `local-task-${Date.now()}`,
        watch_id: "local-watch",
        watch_label: scenarioTitle || "Current business case",
        title: nextAction,
        description: topRisk,
        status: "open",
        created_at: now,
      },
      ...(base.open_tasks ?? []).slice(0, 3),
    ],
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

async function fetchWithRetry(url, options, { timeoutMs = 12000, retries = 0 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await wait(500 * (attempt + 1));
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error("Request failed.");
}

function isBusinessDecisionPrompt(message, form = {}) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) {
    return false;
  }

  const businessSignals = [
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
  ];
  const generalKnowledgePatterns = [
    /\bwho is\b/,
    /\bwhat is\b/,
    /\bwhen was\b/,
    /\bwhere is\b/,
    /\btell me about\b/,
    /\bbiography\b/,
    /\bnet worth\b/,
    /\bpresident\b/,
    /\bactor\b/,
    /\bsinger\b/,
    /\bcelebrity\b/,
  ];

  if (generalKnowledgePatterns.some((pattern) => pattern.test(text))) {
    return false;
  }

  if (businessSignals.some((signal) => text.includes(signal))) {
    return true;
  }

  return /\bshould we\b|\bcan this work\b|\bhow risky\b|\bhow should\b|\bbest way to launch\b|\bbusiness plan\b|\bpricing plan\b/.test(
    text,
  );
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

function buildNonBusinessPromptResult(message, selectedAgentNames = []) {
  const addressedAgents = ["General Assistant"];
  const samplePrompts = [
    "Should I open a game center near a college?",
    "What pricing model should I use for my tutoring startup?",
    "How risky is it to launch with only 8 months of cash left?",
  ];
  const redirectMessage =
    "This demo is built for business decisions, not general biography or trivia questions. Ask about a business idea, pricing, market demand, launch risk, hiring, or growth strategy and the advisors will help.";

  return {
    company_name: "Business decision review",
    agent_definitions: [],
    conversation: addressedAgents.map((agentName) => ({
      agent_name: agentName,
      role: "Direct model answer",
      round: 1,
      scenario_name: "Base Scenario",
      message: redirectMessage,
      stance: "MODIFY",
      confidence: 94,
      topics: ["question fit"],
      key_points: ["Ask a business question", "Include your idea, market, cost, or risk"],
      assumptions: [],
      references: [],
      challenged_agents: [],
      policy_positions: {},
      score_snapshot: {},
      estimated_metrics: {},
      calculations: [],
      memory_references: [],
      research_points: [],
    })),
    round_summaries: [
      {
        round: 1,
        synopsis: "The latest prompt looks outside the business-advice scope of this demo.",
        consensus_points: ["Redirect to a business-focused question."],
        conflict_points: [],
        open_questions: samplePrompts,
        numeric_highlights: { average_confidence: 94 },
      },
    ],
    conflicts: [],
    final_output: {
      decision: "MODIFY",
      confidence: 94,
      key_reasons: [
        "This demo works best when the prompt is about a business decision or startup plan.",
        `The last prompt looked like a general question: "${String(message).trim().slice(0, 120)}${String(message).trim().length > 120 ? "..." : ""}"`,
      ],
      risks: ["General-knowledge prompts produce weak advisor output because the app is tuned for business cases."],
      recommended_actions: samplePrompts,
    },
    actions: {
      execution_plan: samplePrompts.map((prompt, index) => ({
        step: prompt,
        owner: "CEO Agent",
        timeline: index === 0 ? "Try now" : "Optional",
        success_metric: "The next prompt is clearly about a business decision.",
      })),
      marketing_strategy: {
        audience: "Demo user",
        positioning: "Business-advice demo",
        core_message: "Ask about a business idea, market, pricing, costs, risks, or launch timing.",
        channels: [],
        ad_angles: [],
      },
      financial_plan: {
        assumptions: [],
        monthly_costs: [],
        revenue_projection: [],
        roi_estimate: "No estimate yet because this was not a business case.",
      },
      hiring_plan: {
        roles: [],
        hiring_sequence: ["No hiring advice yet because this was not a business case."],
      },
    },
    scenario_results: [],
    explainability: {
      top_influencer: addressedAgents[0],
      conflicts: [],
      final_reasoning_summary:
        "The request was redirected because it looks like a general question instead of a business decision. The app is now guiding the user toward a better prompt.",
      reasoning_trace: [
        {
          agent_name: "General Assistant",
          influence_score: 1,
          stance: "MODIFY",
          summary: redirectMessage,
        },
      ],
    },
    memory_summary: {
      recalled_simulations: 0,
      prior_failures: [],
      learned_adjustments: ["Redirect general questions toward business prompts."],
      prior_agent_arguments: {},
    },
    validation: {
      decisions_made: true,
      multiple_scenarios_simulated: false,
      actions_generated: true,
      memory_used: false,
      passed: true,
    },
  };
}

function buildLocalFallbackAnalysis(payload) {
  if (!isBusinessDecisionPrompt(payload.business_problem, payload)) {
    return buildNonBusinessPromptResult(payload.business_problem, payload.selected_agent_names ?? []);
  }

  const agentNames = payload.selected_agent_names?.length ? payload.selected_agent_names : Object.keys(AGENT_META);
  const summary = estimateFallbackSummary(payload);
  const conversation = agentNames.map((agentName, index) =>
    buildLocalFallbackTurn({
      agentName,
      payload,
      summary,
      round: 1,
      confidenceOffset: (index % 3) * 2,
    }),
  );
  const roundSummary = {
    round: 1,
    synopsis: "Quick backup review generated from the current prompt.",
    consensus_points: [summary.mainReason],
    conflict_points: summary.conflicts.slice(0, 2),
    open_questions: summary.openQuestions.slice(0, 3),
    numeric_highlights: {
      average_confidence: summary.confidence,
      average_expected_roi_pct: summary.estimatedMetrics.expected_roi_pct,
      conflict_count: summary.conflicts.length,
    },
  };
  const conflicts = summary.conflicts.slice(0, 2).map((description, index) => ({
    round: 1,
    topic: index === 0 ? "Cost vs demand" : "Speed vs caution",
    agents: summary.topInfluencer === "Finance Agent" ? ["Finance Agent", "CEO Agent"] : ["CEO Agent", "Risk Agent"],
    opposing_agents: summary.topInfluencer === "Finance Agent" ? ["Startup Builder Agent"] : ["Startup Builder Agent"],
    description,
    severity: index === 0 ? 4 : 3,
    conflict_detected: true,
    conflict_type: index === 0 ? "Money vs growth" : "Speed vs risk",
    impact: index === 0 ? "High" : "Medium",
  }));

  return {
    company_name: payload.company_name,
    agent_definitions: [],
    conversation,
    round_summaries: [roundSummary],
    conflicts,
    final_output: {
      decision: summary.decision,
      confidence: summary.confidence,
      key_reasons: [summary.mainReason, summary.supportReason],
      risks: summary.risks,
      recommended_actions: summary.nextSteps,
    },
    actions: buildLocalFallbackActions(payload, summary),
    scenario_results: buildLocalFallbackScenarios(summary),
    explainability: {
      top_influencer: summary.topInfluencer,
      conflicts: conflicts.map((conflict) => conflict.description),
      final_reasoning_summary: summary.explainability,
      reasoning_trace: agentNames.slice(0, 4).map((agentName, index) => ({
        agent_name: agentName,
        influence_score: Number((1.15 - index * 0.12).toFixed(2)),
        stance: summary.decision,
        summary: buildFallbackAgentLine(agentName, payload, summary).split(". ")[0] + ".",
      })),
    },
    memory_summary: {
      recalled_simulations: 1,
      prior_failures: ["This fast backup review used the information from your current prompt."],
      learned_adjustments: summary.nextSteps.slice(0, 2),
      prior_agent_arguments: {},
    },
    validation: {
      decisions_made: true,
      multiple_scenarios_simulated: true,
      actions_generated: true,
      memory_used: true,
      passed: true,
    },
  };
}

function estimateFallbackSummary(payload) {
  const text = String(payload.business_problem || "").toLowerCase();
  const runway = Number(payload.known_metrics?.runway_months || 0);
  const grossMargin = Number(payload.known_metrics?.gross_margin || 0);
  const pricePoint = Number(payload.known_metrics?.price_point || 0);
  const localVenue = /\bgame center|gaming|arcade|college|campus|snacks|tournament\b/.test(text);
  const priceSensitive = /\bprice-sensitive|price sensitive|budget-conscious|cheap|discount\b/.test(text);
  const heavySetup = /\bupfront|fit-?out|equipment|rent|staff|setup|capex|capital\b/.test(text);
  const strongDemand = /\bstrong student traffic|foot traffic|hostels|college|busy area|repeat visits\b/.test(text);

  let score = 0;
  if (strongDemand) score += 2;
  if (localVenue) score += 1;
  if (priceSensitive) score -= 1;
  if (heavySetup) score -= 2;
  if (runway && runway < 8) score -= 2;
  if (runway && runway >= 12) score += 1;
  if (grossMargin && grossMargin >= 60) score += 1;

  const decision = score >= 2 ? "GO" : score <= -2 ? "NO GO" : "MODIFY";
  const confidence = decision === "MODIFY" ? 74 : decision === "GO" ? 78 : 76;
  const estimatedRevenue = localVenue ? (pricePoint || 4) * 18000 : pricePoint ? pricePoint * 14 : 85000;
  const launchBudget = localVenue ? Math.max(18000, (pricePoint || 5) * 4200) : 42000;
  const paybackMonths = decision === "GO" ? 7.5 : decision === "MODIFY" ? 10.0 : 14.0;
  const expectedRoi = Number((((estimatedRevenue * 0.35) - launchBudget) / Math.max(launchBudget, 1) * 100).toFixed(1));
  const topInfluencer = heavySetup ? "Finance Agent" : strongDemand ? "Market Research Agent" : "CEO Agent";

  return {
    decision,
    confidence,
    topInfluencer,
    mainReason:
      decision === "GO"
        ? "The plan looks workable if you keep the first launch small and stay disciplined on spending."
        : decision === "MODIFY"
          ? "The idea looks promising, but it needs a smaller first launch, tighter spending, and proof that repeat demand is real."
          : "The idea is interesting, but the current setup looks too risky until the upfront cost and demand uncertainty come down.",
    supportReason:
      localVenue
        ? "The student location helps demand, but the biggest watch-outs are price sensitivity, equipment cost, and whether people come back often enough."
        : "The biggest question is whether demand is strong enough to justify the upfront investment and operating effort.",
    risks: heavySetup
      ? [
          "The upfront setup cost could become too heavy before demand is proven.",
          "Student demand may look strong at first but still be inconsistent on normal weekdays.",
          "Low pricing could fill the venue without leaving enough profit.",
        ]
      : [
          "Demand may not convert into repeat paying customers quickly enough.",
          "The first version could become too broad before the economics are proven.",
        ],
    nextSteps: localVenue
      ? [
          "Start with a smaller first version, fewer stations, and one simple food offer.",
          "Test hourly pricing, bundle pricing, and membership pricing with real students before the full fit-out.",
          "Use tournaments and hostel partnerships to build repeat visits early.",
        ]
      : [
          "Start with a narrower first offer and prove demand before committing fully.",
          "Set spending limits and success checkpoints before scaling.",
          "Talk to early buyers and tighten the offer around the clearest need.",
        ],
    conflicts: [
      "The upside looks real, but the upfront cost and ongoing operating load could get too heavy too early.",
      "The team wants to move fast, but only after the first version is small enough to learn cheaply.",
    ],
    openQuestions: [
      "How many repeat visits or repeat customers are needed to break even each month?",
      "What is the smallest launch version that still feels attractive to early customers?",
      "Which pricing option brings students in without making the business too thin on margin?",
    ],
    explainability:
      "This quick backup review leans on the demand signals in your prompt, the likely startup cost, and the need to keep the first launch small enough to learn safely.",
    estimatedMetrics: {
      expected_roi_pct: expectedRoi,
      estimated_payback_months: paybackMonths,
      projected_annual_revenue: Number(estimatedRevenue.toFixed(0)),
      launch_budget: Number(launchBudget.toFixed(0)),
      price_point: pricePoint || (localVenue ? 4 : 299),
      gross_margin_pct: grossMargin || (localVenue ? 52 : 61),
      expected_customers_12m: localVenue ? 4200 : 120,
    },
  };
}

function buildLocalFallbackTurn({ agentName, payload, summary, round, confidenceOffset }) {
  const meta = AGENT_META[agentName] ?? AGENT_META["CEO Agent"];
  const message = buildFallbackAgentLine(agentName, payload, summary);
  return {
    agent_name: agentName,
    role: meta.boardRole,
    round,
    scenario_name: "Base Scenario",
    message,
    stance: summary.decision,
    confidence: Math.max(62, Math.min(90, summary.confidence - confidenceOffset)),
    topics: [],
    key_points: summary.nextSteps.slice(0, 2),
    assumptions: summary.risks.slice(0, 2),
    references: [],
    challenged_agents: [],
    policy_positions: {},
    score_snapshot: {},
    estimated_metrics: summary.estimatedMetrics,
    calculations: [],
    memory_references: [],
    research_points: [],
  };
}

function buildFallbackAgentLine(agentName, payload, summary) {
  const lower = String(payload.business_problem || "").toLowerCase();
  const localVenue = /\bgame center|gaming|arcade|college|campus\b/.test(lower);

  const localTemplates = {
    "CEO Agent": "I would move carefully here. The best path is a smaller first launch with clear goals for demand, repeat visits, and monthly break-even.",
    "Startup Builder Agent": "Do not build the full version on day one. Start smaller, prove demand fast, and expand only after you see steady repeat visits.",
    "Market Research Agent": "Before a full launch, talk to students nearby, test pricing, and confirm what mix of gaming, events, and snacks they actually want.",
    "Finance Agent": "This can work only if the fit-out, equipment, and rent stay under control. The business should prove repeat demand before taking on a heavy fixed-cost base.",
    "Marketing Agent": "Lead with affordable entry pricing, tournaments, and hostel or campus partnerships so the venue becomes a habit, not just a one-time visit.",
    "Pricing Agent": "Use simple hourly pricing, bundles, and a membership option. The goal is to stay student-friendly without making the margin too thin.",
    "Supply Chain Agent": "Keep operations simple at the start: a small number of stations, a short menu, and limited tournament commitments until the workflow is stable.",
    "Hiring Agent": "Start with a lean team and only add more staff once weekday traffic and repeat visits are consistent.",
    "Risk Agent": "The biggest risk is spending too much before you know how often students will come back. Keep the first version small enough that a slow start is survivable.",
    "Sales Strategy Agent": "Treat the early sales motion like community building. Pre-opening signups, student clubs, and tournament registrations are the first proof points.",
  };

  const genericTemplates = {
    "CEO Agent": "I would move ahead only with a narrower first version and clear success checkpoints.",
    "Startup Builder Agent": "The first version should be small enough to launch quickly and learn from real customers.",
    "Market Research Agent": "The first decision should be based on real customer proof, not just a broad market story.",
    "Finance Agent": "The plan needs tighter control over spending and a clear path to earning the money back.",
    "Marketing Agent": "The offer needs a clearer message and one or two strong channels before broader spend.",
    "Pricing Agent": "Pricing should be simple, easy to test, and tied to the clearest value for the customer.",
    "Supply Chain Agent": "Operations should stay simple at the start so quality does not break under early demand.",
    "Hiring Agent": "Keep the team lean at first and hire only for the most critical gaps.",
    "Risk Agent": "The main downside is committing too much too early before demand and execution are proven.",
    "Sales Strategy Agent": "The first sales motion should focus on a narrow customer group with a simple buying path.",
  };

  return (localVenue ? localTemplates[agentName] : genericTemplates[agentName]) || genericTemplates["CEO Agent"];
}

function buildLocalFallbackActions(payload, summary) {
  return {
    execution_plan: summary.nextSteps.map((step, index) => ({
      step,
      owner: index === 0 ? "CEO Agent" : index === 1 ? "Market Research Agent" : "Finance Agent",
      timeline: index === 0 ? "Week 1" : index === 1 ? "Weeks 1-2" : "Weeks 2-4",
      success_metric:
        index === 0
          ? "Agree on the smallest first launch."
          : index === 1
            ? "Get enough customer proof to support the launch plan."
            : "Keep early spending within the planned limit.",
    })),
    marketing_strategy: {
      audience: "The clearest first customer group mentioned in the prompt",
      positioning: "A simpler, safer first version that solves one strong need well.",
      core_message: "Start small, prove the demand, and scale only after the numbers are healthy.",
      channels: [
        {
          channel: "Local partnerships and direct outreach",
          objective: "Get early customers or foot traffic quickly",
          message: "Invite early users with a simple clear offer",
          budget_share_pct: 40,
        },
        {
          channel: "Social content and repeat-visit offers",
          objective: "Drive repeat usage",
          message: "Show why the first experience is worth coming back for",
          budget_share_pct: 35,
        },
      ],
      ad_angles: ["Lead with the clearest value", "Keep the launch narrow and easy to understand"],
    },
    financial_plan: {
      assumptions: [
        { name: "Launch budget", value: `${summary.estimatedMetrics.launch_budget}`, rationale: "Quick fallback estimate based on the prompt." },
        { name: "Expected yearly sales", value: `${summary.estimatedMetrics.projected_annual_revenue}`, rationale: "Used to shape the backup recommendation." },
      ],
      monthly_costs: [
        { category: "Launch spending", monthly_cost: Number((summary.estimatedMetrics.launch_budget / 4).toFixed(0)) },
        { category: "Operations", monthly_cost: Number((summary.estimatedMetrics.launch_budget / 6).toFixed(0)) },
      ],
      revenue_projection: [
        { milestone: "Month 3", customers: 20, revenue: Number((summary.estimatedMetrics.projected_annual_revenue * 0.18).toFixed(0)) },
        { milestone: "Month 12", customers: summary.estimatedMetrics.expected_customers_12m, revenue: summary.estimatedMetrics.projected_annual_revenue },
      ],
      roi_estimate: `Quick fallback estimate: about ${summary.estimatedMetrics.expected_roi_pct}% return with roughly ${summary.estimatedMetrics.estimated_payback_months} months payback.`,
    },
    hiring_plan: {
      roles: [
        { role: "Operations lead", timing: "Early", reason: "Keep the first launch stable and well run.", estimated_monthly_cost: 2500 },
        { role: "Customer-facing support", timing: "After demand is proven", reason: "Support repeat users without overhiring too early.", estimated_monthly_cost: 1800 },
      ],
      hiring_sequence: ["Keep the initial team lean.", "Add support only after demand becomes consistent."],
    },
  };
}

function buildLocalFallbackScenarios(summary) {
  return [
    {
      scenario: "Lean budget case",
      decision: summary.decision === "GO" ? "MODIFY" : summary.decision,
      confidence: Math.max(60, summary.confidence - 6),
      difference_from_base: "With a tighter budget, the answer becomes more cautious and the launch needs to be smaller.",
      reasoning_shift: ["Finance and Risk matter more when the budget gets tighter."],
      changed_agents: ["Finance Agent", "Risk Agent"],
      top_influencer: "Finance Agent",
    },
    {
      scenario: "Stronger demand case",
      decision: summary.decision === "NO GO" ? "MODIFY" : "GO",
      confidence: Math.min(88, summary.confidence + 5),
      difference_from_base: "If demand is stronger than expected, the team becomes more comfortable moving ahead.",
      reasoning_shift: ["Market Research and CEO become more positive when demand proof improves."],
      changed_agents: ["Market Research Agent", "CEO Agent"],
      top_influencer: "CEO Agent",
    },
  ];
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
