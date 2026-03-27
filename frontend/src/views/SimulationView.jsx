function SimulationView({
  agentMeta,
  agentDefinitionsMap,
  result,
  loading,
  activeTypingAgent,
  speakingAgent,
  groupedConversation,
  topConflictByRound,
  displayedRounds,
  currentRound,
  scenarioTitle,
  highestRisk,
  recommendedDirective,
  onToggleConsole,
  onApplySample,
}) {
  const speakingMeta = agentMeta[speakingAgent] ?? agentMeta["CEO Agent"];

  return (
    <>
      <main className="obsidian-main">
        <aside className="obsidian-sidebar">
          <div className="sidebar-header">
            <h2>Active Matrix</h2>
            <span>{Object.keys(agentMeta).length} ONLINE</span>
          </div>

          <div className="agent-stack">
            {Object.entries(agentMeta).map(([name, meta]) => {
              const isActive = name === speakingAgent;
              const isCalculating = loading && name === activeTypingAgent;
              const definition = agentDefinitionsMap[name];

              return (
                <article
                  key={name}
                  className={isActive ? "agent-card active" : isCalculating ? "agent-card thinking" : "agent-card"}
                  style={{ "--agent-accent": meta.accent }}
                >
                  <div className="agent-card-head">
                    <span className="material-symbols-outlined">{meta.symbol}</span>
                    {isActive ? (
                      <div className="agent-status-speaking">
                        <span>Speaking</span>
                        <div className="signal-bar">
                          <div />
                        </div>
                      </div>
                    ) : null}
                    {!isActive && isCalculating ? <span className="material-symbols-outlined spin">sync</span> : null}
                  </div>
                  <h3>{meta.label}</h3>
                  <p>{definition?.decision_style ?? meta.title}</p>
                </article>
              );
            })}
          </div>

          <div className="sidebar-module">
            <div className="module-label">Command Intake</div>
            <p>
              Feed the simulator a live business problem, constraints, and metrics. The board will turn that into a
              directive.
            </p>
            <div className="module-actions">
              <button type="button" className="secondary-action" onClick={onApplySample}>
                Load Sample
              </button>
              <button type="button" className="primary-action" onClick={onToggleConsole}>
                Open Console
              </button>
            </div>
          </div>
        </aside>

        <section className="obsidian-stream">
          <header className="stream-header">
            <div>
              <div className="header-kicker">
                <span>Simulation Active</span>
                <span className="status-dot small" />
              </div>
              <h1>{scenarioTitle}</h1>
            </div>
            <div className="round-meter">
              <span>
                Round {currentRound || 0} / {displayedRounds}
              </span>
              <div className="meter-track">
                <div className="meter-fill" style={{ width: `${Math.max(8, ((currentRound || 1) / displayedRounds) * 100)}%` }} />
              </div>
            </div>
          </header>

          <div className="stream-body">
            {!result && !loading ? (
              <div className="stream-empty">
                <span className="material-symbols-outlined">terminal</span>
                <h2>Ready For Input</h2>
                <p>Open the command console and send a strategic problem into the boardroom.</p>
              </div>
            ) : null}

            {groupedConversation.map(([round, turns]) => (
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
                      Direct Contradiction
                    </div>
                    <div className="conflict-thread">
                      <p>{topConflictByRound.get(round).description}</p>
                    </div>
                  </div>
                ) : null}

                {turns.map((turn) => {
                  const meta = agentMeta[turn.agent_name] ?? agentMeta["CEO Agent"];

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
                          <span className="message-time">
                            Round {turn.round} - {turn.confidence}% confidence
                          </span>
                        </div>
                        <div className={turn.stance === "NO GO" ? "message-bubble danger" : "message-bubble"}>{turn.message}</div>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}

            {loading ? (
              <div className="typing-row">
                <div className="message-icon typing">
                  <span className="material-symbols-outlined">{speakingMeta.symbol}</span>
                </div>
                <div className="typing-pill">
                  <span />
                  <span />
                  <span />
                  <strong>{speakingMeta.label} is calculating...</strong>
                </div>
              </div>
            ) : null}
          </div>

          <footer className="stream-footer">
            <div className="footer-actions">
              <button type="button" className="footer-link" onClick={onToggleConsole}>
                <span className="material-symbols-outlined">terminal</span>
                Open Console
              </button>
              <button type="button" className="footer-link" onClick={onApplySample}>
                <span className="material-symbols-outlined">history</span>
                Load Sample Scenario
              </button>
            </div>
            <div className="footer-metrics">
              <span>Simulation Fidelity: {result ? "98.4%" : "Standby"}</span>
              <div className="footer-bars">
                <div />
                <div />
                <div />
                <div />
              </div>
            </div>
          </footer>
        </section>

        <aside className="obsidian-insights">
          <div className="directive-card">
            <div className="directive-mark">
              <span className="material-symbols-outlined">gavel</span>
            </div>
            <h2>Final Intelligence Directive</h2>
            <div className="directive-body">
              <p className="directive-title">
                {result?.final_output ? `${result.final_output.decision}: ${recommendedDirective}` : "Awaiting board synthesis"}
              </p>
              <div className="directive-score">
                <div>
                  <span>Confidence Score</span>
                  <strong>{result?.final_output?.confidence ?? 0}%</strong>
                </div>
                <div className="meter-track">
                  <div className="meter-fill" style={{ width: `${result?.final_output?.confidence ?? 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          <section className="insight-section">
            <h3>Key Drivers & Risks</h3>
            <div className="insight-grid">
              <InsightCard
                icon="lightbulb"
                accent="#ddb7ff"
                title="Lead Directive"
                body={result?.final_output?.key_reasons?.[0] ?? "The simulator is waiting for a boardroom run."}
              />
              <InsightCard
                icon="dangerous"
                accent="#ff8f8f"
                title="Primary Risk"
                body={highestRisk}
                kicker={result?.final_output?.risks?.length ? "Critical" : ""}
              />
              <InsightCard
                icon="account_balance"
                accent="#00ff94"
                title="Action Path"
                body={result?.final_output?.recommended_actions?.[0] ?? "No execution path yet."}
              />
            </div>
          </section>

          <section className="health-panel">
            <h3>Simulation Health</h3>
            <div className="health-row">
              <div>
                <span>GPU Cluster Load</span>
                <strong>{loading ? "71%" : result ? "42%" : "Idle"}</strong>
              </div>
              <div className="micro-bars">
                <div />
                <div />
                <div />
                <div />
                <div />
              </div>
            </div>
            <div className="health-block">
              <div className="health-meta">
                <span>Convergence Rate</span>
                <span>{result ? "Optimal" : loading ? "Forming" : "Standby"}</span>
              </div>
              <div className="micro-track">
                <div />
                <div />
                <div />
                <div />
                <div className="dim" />
              </div>
            </div>
            <div className="health-block">
              <div className="health-meta">
                <span>Contradictions</span>
                <span>{result?.conflicts?.length ?? 0}</span>
              </div>
              <div className="conflict-compact-list">
                {(result?.conflicts ?? []).slice(0, 3).map((conflict, index) => (
                  <div key={`${conflict.topic}-${index}`} className="conflict-compact-item">
                    <strong>R{conflict.round}</strong>
                    <p>{conflict.description}</p>
                  </div>
                ))}
                {!result?.conflicts?.length ? <p className="compact-placeholder">Contradictions appear here after debate begins.</p> : null}
              </div>
            </div>
          </section>

          <div className="synapse-strip">
            <div className="synapse-top">
              <span>Network Synapse</span>
              <strong>{loading ? "5.8ms" : "2.4ms"} Latency</strong>
            </div>
            <div className="wave" />
          </div>
        </aside>
      </main>

      <div className="hud-bar">
        <div className="hud-item">
          <span className="material-symbols-outlined">database</span>
          <div>
            <span>Dataset</span>
            <strong>{result ? "LIVE_BOARD_V1" : "OBSIDIAN_V4"}</strong>
          </div>
        </div>
        <div className="hud-divider" />
        <div className="hud-item">
          <span className="material-symbols-outlined">memory</span>
          <div>
            <span>Processing</span>
            <strong>{loading ? "18.8 TFLOPS" : "14.2 TFLOPS"}</strong>
          </div>
        </div>
        <div className="hud-divider" />
        <button type="button" className="hud-input" onClick={onToggleConsole}>
          <span className="material-symbols-outlined">terminal</span>
          Ready For Input...
        </button>
      </div>
    </>
  );
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

export default SimulationView;
