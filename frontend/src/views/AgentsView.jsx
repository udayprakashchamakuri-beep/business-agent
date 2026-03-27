function AgentsView({ agentCards, loading, matrixStats }) {
  return (
    <div className="command-canvas">
      <header className="view-header">
        <div>
          <div className="view-kicker-row">
            <span className="status-chip success">SYSTEM LIVE</span>
            <span className="muted-code">ACTIVE_SIMULATION</span>
          </div>
          <h1>Agent Matrix</h1>
          <p>
            Real-time synchronization of the AI workforce. Monitor neural integrity, decision variance, and deployment
            distribution across all active simulation nodes.
          </p>
        </div>

        <div className="header-callouts">
          <article className="alert-card danger">
            <span>Global Override</span>
            <button type="button">Initialize Kill Switch</button>
          </article>
          <article className="alert-card accent">
            <span>Network Load</span>
            <strong>{matrixStats.networkLoad}</strong>
          </article>
        </div>
      </header>

      <section className="agent-matrix-grid">
        {agentCards.map((agent) => (
          <article key={agent.name} className={`agent-matrix-card tone-${agent.tone}`} style={{ "--card-accent": agent.accent }}>
            <div className="matrix-card-main">
              <div className="matrix-card-header">
                <div className="matrix-agent-id">
                  <div className="matrix-agent-icon">
                    <span className="material-symbols-outlined">{agent.symbol}</span>
                  </div>
                  <div>
                    <h3>{agent.label}</h3>
                    <p>{agent.role}</p>
                  </div>
                </div>
                <div className="matrix-agent-stat">
                  <span>{agent.badgeLabel}</span>
                  <strong>{agent.badgeValue}</strong>
                </div>
              </div>

              <div className="matrix-health">
                <div>
                  <span>Neural Health</span>
                  <strong>{agent.health}</strong>
                </div>
                <div className="matrix-health-track">
                  <div style={{ width: agent.health }} />
                </div>
              </div>

              <div className="matrix-body">
                <div className="matrix-visual">
                  <span className="material-symbols-outlined">{agent.visualIcon}</span>
                  <small>{agent.visualLabel}</small>
                </div>
                <div className="matrix-side-metrics">
                  <div>
                    <span>Current Load</span>
                    <strong>{agent.load}</strong>
                  </div>
                  <div>
                    <span>{agent.historyLabel}</span>
                    <div className="mini-history">
                      {agent.historyBars.map((height, index) => (
                        <i key={`${agent.name}-${index}`} style={{ height }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="matrix-card-footer">
              <span>{agent.status}</span>
              <i className="material-symbols-outlined">{agent.footerIcon}</i>
            </div>
          </article>
        ))}

        <article className="agent-matrix-card deploy-card">
          <div className="deploy-orb">
            <span className="material-symbols-outlined">add</span>
          </div>
          <h3>Deploy New Agent</h3>
          <p>Initialize Core_Fragment_011</p>
        </article>
      </section>

      <section className="matrix-bottom-grid">
        <div className="panel history-panel">
          <div className="panel-topline">
            <div>
              <h2>Historical Performance</h2>
              <p>Aggregated neural throughput (petaflops)</p>
            </div>
            <div className="legend-row">
              <span className="status-chip outline">24H</span>
              <span className="status-chip accent">LIVE</span>
            </div>
          </div>

          <div className="history-bars">
            {matrixStats.performanceBars.map((height, index) => (
              <span key={`${height}-${index}`} style={{ height }} className={index === 4 || (loading && index === 7) ? "live" : ""} />
            ))}
          </div>

          <div className="panel-footer spread-row">
            <span>12:00 UTC</span>
            <span>Aggregated Neural Throughput</span>
            <span>Current Time</span>
          </div>
        </div>

        <div className="panel override-panel">
          <div className="panel-topline">
            <div>
              <h2>System Overrides</h2>
              <p>Board level protocol toggles</p>
            </div>
          </div>

          <div className="override-list">
            {matrixStats.overrides.map((override) => (
              <article key={override.label} className={`override-item tone-${override.tone}`}>
                <div>
                  <strong>{override.label}</strong>
                  <span>{override.detail}</span>
                </div>
                <button type="button" className={override.enabled ? "toggle on" : "toggle"}>
                  <i />
                </button>
              </article>
            ))}
          </div>

          <button type="button" className="wide-secondary">
            View All Protocols
          </button>
        </div>
      </section>
    </div>
  );
}

export default AgentsView;
