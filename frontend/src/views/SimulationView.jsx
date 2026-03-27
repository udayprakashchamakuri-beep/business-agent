import { useEffect, useMemo, useRef } from "react";
import { formatDecisionLabel, toPlainText } from "../plainLanguage";

function SimulationView({
  agentMeta,
  result,
  loading,
  chatMessages,
  chatDraft,
  focusedAgentNames,
  activeTypingAgent,
  speakingAgent,
  groupedConversation,
  topConflictByRound,
  displayedRounds,
  currentRound,
  scenarioTitle,
  highestRisk,
  recommendedDirective,
  actionPlan,
  explainability,
  memorySummary,
  scenarioResults,
  validation,
  onToggleConsole,
  onApplySample,
  onChatDraftChange,
  onSubmitChat,
  onToggleFocusedAgent,
  onSelectOnlyFocusedAgent,
  conversationAgentNames,
  onOpenAgentConversation,
  onOpenAgentProfile,
  onClearAgentConversation,
}) {
  const conversationEndRef = useRef(null);
  const speakingMeta = agentMeta[speakingAgent] ?? agentMeta["CEO Agent"];
  const activeConversationMeta =
    conversationAgentNames.length === 1 ? agentMeta[conversationAgentNames[0]] ?? agentMeta["CEO Agent"] : null;
  const filteredRounds = conversationAgentNames.length
    ? groupedConversation
        .map(([round, turns]) => [round, turns.filter((turn) => conversationAgentNames.includes(turn.agent_name))])
        .filter(([, turns]) => turns.length)
    : groupedConversation;
  const hasAnyDiscussion = groupedConversation.some(([, turns]) => turns.length);
  const hasAdvisorMessages = filteredRounds.some(([, turns]) => turns.length);
  const visibleTurnCount = filteredRounds.reduce((count, [, turns]) => count + turns.length, 0);
  const latestUserMessage = chatMessages[chatMessages.length - 1] ?? null;
  const earlierUserMessages = useMemo(() => chatMessages.slice(0, -1), [chatMessages]);
  const selectedAdvisorLabels = conversationAgentNames.map((name) => agentMeta[name]?.label ?? name);
  const chatTargetLabels = focusedAgentNames.map((name) => agentMeta[name]?.label ?? name);

  useEffect(() => {
    if (!conversationEndRef.current) {
      return;
    }

    conversationEndRef.current.scrollIntoView({
      behavior: loading ? "smooth" : "auto",
      block: "end",
    });
  }, [chatMessages.length, visibleTurnCount, loading, conversationAgentNames]);

  return (
    <>
      <main className="obsidian-main">
        <aside className="obsidian-sidebar">
          <div className="sidebar-header">
            <h2>Advisory Team</h2>
            <span>{Object.keys(agentMeta).length} advisors</span>
          </div>

          <div className="agent-stack">
            {Object.entries(agentMeta).map(([name, meta]) => {
              const isActive = name === speakingAgent;
              const isCalculating = loading && name === activeTypingAgent;
              const isSelected = conversationAgentNames.includes(name);
              const cardClassName = isSelected
                ? "agent-card selected agent-card-link"
                : isActive
                  ? "agent-card active agent-card-link"
                  : isCalculating
                    ? "agent-card thinking agent-card-link"
                    : "agent-card agent-card-link";

              return (
                <button
                  key={name}
                  type="button"
                  className={cardClassName}
                  style={{ "--agent-accent": meta.accent }}
                  onClick={() => onOpenAgentConversation(name)}
                  aria-label={`Open ${meta.label} details`}
                >
                  <div className="agent-card-head">
                    <span className="material-symbols-outlined">{meta.symbol}</span>
                    {isActive ? (
                      <div className="agent-status-speaking">
                        <span>Talking</span>
                        <div className="signal-bar">
                          <div />
                        </div>
                      </div>
                    ) : null}
                    {!isActive && isCalculating ? <span className="material-symbols-outlined spin">sync</span> : null}
                  </div>
                  <h3>{meta.label}</h3>
                  <p>{meta.title}</p>
                  <span className="agent-card-cta">
                    {isSelected ? "Selected for this conversation" : "Add this advisor to the conversation view"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="sidebar-module">
            <div className="module-label">How It Works</div>
            <p>
              Enter your business question, key limits, and numbers. The advisory team will discuss it and return a
              recommendation, risks, and next steps.
            </p>
            <p className="sidebar-helper-copy">Click advisor cards above to filter the thread. You can keep one, several, or all advisors visible.</p>
            <div className="module-actions">
              <button type="button" className="secondary-action" onClick={onApplySample}>
                Use Example
              </button>
              <button type="button" className="primary-action" onClick={onToggleConsole}>
                Open Detailed Form
              </button>
            </div>
          </div>
        </aside>

        <section className="obsidian-stream">
          <header className="stream-header">
            <div>
              <div className="header-kicker">
                <span>Analysis Running</span>
                <span className="status-dot small" />
              </div>
              <h1>{scenarioTitle}</h1>
            </div>
            <div className="round-meter">
              <span>
                Round {currentRound || 0} / {displayedRounds}
              </span>
              <div className="meter-track">
                <div
                  className="meter-fill"
                  style={{ width: `${Math.max(8, ((currentRound || 1) / displayedRounds) * 100)}%` }}
                />
              </div>
            </div>
          </header>

          <div className="stream-body">
            {!hasAnyDiscussion && !loading && !chatMessages.length ? (
              <div className="stream-empty">
                <span className="material-symbols-outlined">terminal</span>
                <h2>Ready To Start</h2>
                <p>Type your business question below or open the detailed form if you want to add numbers first.</p>
              </div>
            ) : null}

            {conversationAgentNames.length ? (
              <div className="conversation-filter-bar" style={{ "--agent-accent": activeConversationMeta?.accent ?? "#ffe16d" }}>
                <div>
                  <strong>
                    {conversationAgentNames.length === 1
                      ? `${activeConversationMeta?.label ?? "Advisor"} conversation`
                      : "Selected advisor conversations"}
                  </strong>
                  <p>
                    Showing only replies from {selectedAdvisorLabels.join(", ")}.
                  </p>
                </div>
                <div className="conversation-filter-actions">
                  {conversationAgentNames.length === 1 ? (
                    <button type="button" className="footer-link" onClick={() => onOpenAgentProfile(conversationAgentNames[0])}>
                      Open advisor profile
                    </button>
                  ) : null}
                  <button type="button" className="footer-link" onClick={onClearAgentConversation}>
                    Show all advisors
                  </button>
                </div>
              </div>
            ) : null}

            {earlierUserMessages.length ? (
              <section className="round-section user-history-section">
                <div className="round-divider">
                  <div />
                  <span>Earlier notes from you</span>
                  <div />
                </div>

                {earlierUserMessages.map((message, index) => (
                  <article key={message.id ?? `${message.timestamp}-${index}`} className="debate-message user">
                    <div className="message-icon user">
                      <span className="material-symbols-outlined">person</span>
                    </div>
                    <div className="message-content">
                      <div className="message-meta">
                        <span className="message-name">You</span>
                        <span className="message-time">Earlier message</span>
                      </div>
                      <div className="message-bubble user">{toPlainText(message.content)}</div>
                      {message.targetAgentNames?.length ? (
                        <div className="message-tags">
                          <span className="message-tag soft">
                            Sent to {message.targetAgentNames.map((name) => agentMeta[name]?.label ?? name).join(", ")}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </section>
            ) : null}

            {latestUserMessage ? (
              <section className="round-section latest-user-section">
                <div className="round-divider">
                  <div />
                  <span>Your latest message</span>
                  <div />
                </div>

                <article className="debate-message user latest-user-message">
                  <div className="message-icon user">
                    <span className="material-symbols-outlined">person</span>
                  </div>
                  <div className="message-content">
                    <div className="message-meta">
                      <span className="message-name">You</span>
                      <span className="message-time">Just sent</span>
                    </div>
                    <div className="message-bubble user">{toPlainText(latestUserMessage.content)}</div>
                    <div className="message-tags">
                      <span className="message-tag soft">
                        {latestUserMessage.targetAgentNames?.length
                          ? `Sent to ${latestUserMessage.targetAgentNames.map((name) => agentMeta[name]?.label ?? name).join(", ")}`
                          : "Sent to all advisors"}
                      </span>
                    </div>
                  </div>
                </article>
              </section>
            ) : null}

            {filteredRounds.map(([round, turns]) => (
              <section key={round} className="round-section">
                <div className="round-divider">
                  <div />
                  <span>Round {String(round).padStart(2, "0")}</span>
                  <div />
                </div>

                {topConflictByRound.has(round) ? (
                  <div className="conflict-cluster">
                    <div className="conflict-badge">
                      <span className="material-symbols-outlined">warning</span>
                      Key Disagreement
                    </div>
                    <div className="conflict-thread">
                      <p>{toPlainText(topConflictByRound.get(round).description)}</p>
                    </div>
                  </div>
                ) : null}

                {turns.map((turn) => {
                  const meta = agentMeta[turn.agent_name] ?? agentMeta["CEO Agent"];
                  const referenceLabels = formatAgentNames(turn.references, agentMeta);
                  const challengedLabels = formatAgentNames(turn.challenged_agents, agentMeta);
                  const stanceClassName = getStanceClassName(turn.stance);

                  return (
                    <article
                      key={`${turn.agent_name}-${turn.round}`}
                      className={turn.agent_name === speakingAgent && !loading ? "debate-message active" : "debate-message"}
                      style={{ "--agent-accent": meta.accent }}
                    >
                      <div className="message-icon">
                        <span className="material-symbols-outlined">{meta.symbol}</span>
                      </div>
                      <div className="message-content">
                        <div className="message-meta">
                          <span className="message-name">{meta.label}</span>
                          <span className="message-time">Round {turn.round} - {turn.confidence}% confidence</span>
                        </div>
                        <div className={turn.stance === "NO GO" ? "message-bubble danger" : "message-bubble"}>
                          {toPlainText(turn.message)}
                        </div>
                        <div className="message-tags">
                          <span className={`message-tag ${stanceClassName}`}>{formatDecisionLabel(turn.stance)}</span>
                          {referenceLabels.length ? <span className="message-tag soft">Responds to {referenceLabels.join(", ")}</span> : null}
                          {challengedLabels.length ? <span className="message-tag soft">Challenges {challengedLabels.join(", ")}</span> : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}

            {conversationAgentNames.length && hasAnyDiscussion && !filteredRounds.length && !loading ? (
              <div className="stream-empty conversation-empty">
                <span className="material-symbols-outlined">{activeConversationMeta?.symbol ?? "groups"}</span>
                <h2>No visible replies yet</h2>
                <p>The selected advisors do not have visible replies in this part of the discussion yet. Choose another advisor or show all advisors.</p>
              </div>
            ) : null}

            {loading ? (
              <div className="typing-row">
                <div className="message-icon typing">
                  <span className="material-symbols-outlined">{speakingMeta.symbol}</span>
                </div>
                <div className="typing-pill">
                  <span />
                  <span />
                  <span />
                  <strong>{speakingMeta.label} is thinking...</strong>
                </div>
              </div>
            ) : null}

            <div ref={conversationEndRef} className="conversation-end-anchor" />
          </div>

          <footer className="stream-footer">
            <form
              className="discussion-composer"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitChat(chatDraft);
              }}
            >
              <div className="composer-targets">
                <span className="composer-target-label">Talk to</span>
                <div className="composer-target-chips">
                  <button
                    type="button"
                    className={focusedAgentNames.length ? "target-chip" : "target-chip active"}
                    onClick={() => onSelectOnlyFocusedAgent("")}
                  >
                    All advisors
                  </button>
                  {Object.entries(agentMeta).map(([name, meta]) => (
                    <button
                      key={name}
                      type="button"
                      className={focusedAgentNames.includes(name) ? "target-chip active" : "target-chip"}
                      style={{ "--target-accent": meta.accent }}
                      onClick={() => onToggleFocusedAgent(name)}
                    >
                      <span className="material-symbols-outlined">{meta.symbol}</span>
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="composer-textarea"
                rows="4"
                placeholder={
                  focusedAgentNames.length === 1
                    ? `Ask ${agentMeta[focusedAgentNames[0]]?.label ?? "this advisor"} something in plain language...`
                    : focusedAgentNames.length > 1
                      ? `Ask ${chatTargetLabels.join(", ")} something in plain language...`
                    : "Example: We are a small SaaS company thinking about expanding into hospitals, but we only have 10 months of cash left. Should we launch now or wait?"
                }
                value={chatDraft}
                onChange={(event) => onChatDraftChange(event.target.value)}
              />
              <div className="composer-actions">
                <span className="composer-hint">
                  {focusedAgentNames.length === 1
                    ? `Your next message will focus on ${agentMeta[focusedAgentNames[0]]?.label ?? "that advisor"}.`
                    : focusedAgentNames.length > 1
                      ? `Your next message will focus on ${chatTargetLabels.join(", ")}.`
                    : "Tip: mention your market, cash situation, team size, pricing, or any big concern."}
                </span>
                <div className="composer-action-group">
                  <span className="composer-status">{loading ? "Advisors are reviewing..." : result ? "Latest reply visible above" : "Ready for your question"}</span>
                  <button type="submit" className="primary-action" disabled={loading || chatDraft.trim().length < 20}>
                    {loading ? "Reviewing..." : "Send"}
                  </button>
                </div>
              </div>
            </form>
          </footer>
        </section>

        <aside className="obsidian-insights">
          <div className="directive-card">
            <div className="directive-mark">
              <span className="material-symbols-outlined">gavel</span>
            </div>
            <h2>Final Recommendation</h2>
            <div className="directive-body">
              <p className="directive-title">
                {result?.final_output
                  ? `${formatDecisionLabel(result.final_output.decision)}: ${toPlainText(recommendedDirective)}`
                  : "Waiting for the team to finish its review"}
              </p>
              <div className="directive-score">
                <div>
                  <span>Confidence</span>
                  <strong>{result?.final_output?.confidence ?? 0}%</strong>
                </div>
                <div className="meter-track">
                  <div className="meter-fill" style={{ width: `${result?.final_output?.confidence ?? 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          <section className="insight-section">
            <h3>Main Reasons And Risks</h3>
            <div className="insight-grid">
              <InsightCard
                icon="lightbulb"
                accent="#ddb7ff"
                title="Main Reason"
                body={toPlainText(result?.final_output?.key_reasons?.[0] ?? "The team is waiting to review your case.")}
              />
              <InsightCard
                icon="dangerous"
                accent="#ff8f8f"
                title="Biggest Risk"
                body={toPlainText(highestRisk)}
                kicker={result?.final_output?.risks?.length ? "Critical" : ""}
              />
              <InsightCard
                icon="account_balance"
                accent="#00ff94"
                title="Best Next Step"
                body={toPlainText(result?.final_output?.recommended_actions?.[0] ?? "No action steps yet.")}
              />
            </div>
          </section>

          <section className="health-panel">
            <h3>Action Plan</h3>
            <div className="execution-list">
              {(actionPlan?.execution_plan ?? []).slice(0, 4).map((step, index) => (
                <div key={`${step.owner}-${index}`} className="execution-item">
                  <strong>{step.timeline}</strong>
                  <div>
                    <p>{toPlainText(step.step)}</p>
                    <span>
                      {step.owner} - {toPlainText(step.success_metric)}
                    </span>
                  </div>
                </div>
              ))}
              {!actionPlan?.execution_plan?.length ? (
                <p className="compact-placeholder">Action steps will appear after the team makes a recommendation.</p>
              ) : null}
            </div>
            <div className="scenario-grid">
              {(scenarioResults ?? []).map((scenario) => (
                <article key={scenario.scenario} className="scenario-card">
                  <div className="scenario-card-top">
                    <strong>{scenario.scenario}</strong>
                    <span>{formatDecisionLabel(scenario.decision)}</span>
                  </div>
                  <p>{toPlainText(scenario.difference_from_base)}</p>
                  <small>{toPlainText(scenario.reasoning_shift?.[0] ?? "The recommendation stayed mostly the same.")}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="health-panel">
            <h3>Why This Recommendation Was Made</h3>
            <div className="health-block">
              <div className="health-meta">
                <span>Most influential advisor</span>
                <span>{explainability?.top_influencer ?? "Pending"}</span>
              </div>
              <p className="insight-paragraph">
                {toPlainText(
                  explainability?.final_reasoning_summary ??
                    "The team will summarize why it reached this recommendation.",
                )}
              </p>
            </div>
            <div className="health-block">
              <div className="health-meta">
                <span>Past similar cases</span>
                <span>{memorySummary?.recalled_simulations ?? 0}</span>
              </div>
              <p className="insight-paragraph">
                {toPlainText(
                  memorySummary?.prior_failures?.[0] ??
                    "The system can save past cases and use them in future recommendations.",
                )}
              </p>
            </div>
            <div className="health-block">
              <div className="health-meta">
                <span>System checks</span>
                <span>{validation?.passed ? "Passed" : loading ? "Running" : "Waiting"}</span>
              </div>
              <div className="validation-grid">
                <ValidationPill label="Decision" ok={validation?.decisions_made} />
                <ValidationPill label="Scenarios" ok={validation?.multiple_scenarios_simulated} />
                <ValidationPill label="Action plan" ok={validation?.actions_generated} />
                <ValidationPill label="Memory" ok={validation?.memory_used} />
              </div>
            </div>
            <div className="health-block">
              <div className="health-meta">
                <span>Disagreements</span>
                <span>{result?.conflicts?.length ?? 0}</span>
              </div>
              <div className="conflict-compact-list">
                {(result?.conflicts ?? []).slice(0, 3).map((conflict, index) => (
                  <div key={`${conflict.topic}-${index}`} className="conflict-compact-item">
                    <strong>{toPlainText(conflict.conflict_type)}</strong>
                    <p>{toPlainText(conflict.description)}</p>
                  </div>
                ))}
                {!result?.conflicts?.length ? (
                  <p className="compact-placeholder">Important disagreements will appear here after the discussion starts.</p>
                ) : null}
              </div>
            </div>
          </section>

          <div className="synapse-strip">
            <div className="synapse-top">
              <span>System status</span>
              <strong>{loading ? "5.8ms" : "2.4ms"} Latency</strong>
            </div>
            <div className="wave" />
          </div>
        </aside>
      </main>

    </>
  );
}

function formatAgentNames(names, agentMeta) {
  return (names ?? []).slice(0, 3).map((name) => agentMeta[name]?.label ?? name.replace(" Agent", ""));
}

function getStanceClassName(stance) {
  if (stance === "GO") {
    return "tone-go";
  }
  if (stance === "MODIFY") {
    return "tone-modify";
  }
  return "tone-no-go";
}

function InsightCard({ icon, accent, title, body, kicker }) {
  return (
    <article className="insight-card" style={{ "--insight-accent": accent }}>
      <div className="insight-title-row">
        <div className="insight-title">
          <span className="material-symbols-outlined">{icon}</span>
          <strong>{title}</strong>
        </div>
        {kicker ? <span className="insight-kicker">{kicker}</span> : null}
      </div>
      <p>{body}</p>
    </article>
  );
}

function ValidationPill({ label, ok }) {
  return <span className={ok ? "validation-pill ok" : "validation-pill"}>{label}</span>;
}

export default SimulationView;
