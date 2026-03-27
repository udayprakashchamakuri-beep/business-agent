function IntelligenceView({
  scenarioTitle,
  loading,
  intelligenceMetrics,
  semanticStream,
  timelinePoints,
  agentTelemetry,
}) {
  const featuredNodes = agentTelemetry.slice(0, 2);

  return (
    <div className="command-canvas">
      <header className="view-header intelligence-header">
        <div>
          <div className="view-kicker-row">
            <span className="status-chip success">{loading ? "SYSTEM_ROUTING" : "SYSTEM_STABLE"}</span>
            <span className="muted-code">LATENCY: {intelligenceMetrics.latency}</span>
          </div>
          <h1>Intelligence Hub</h1>
          <p>
            Real-time telemetry for the enterprise boardroom. Monitor semantic flow, neural convergence, and how the
            debate is moving the company toward a directive for {scenarioTitle}.
          </p>
        </div>

        <div className="metric-strip">
          <MetricCard label="Throughput" value={intelligenceMetrics.throughput} accent="finance" suffix="TB/S" />
          <MetricCard label="Accuracy" value={intelligenceMetrics.accuracy} accent="accent" suffix="%" />
          <MetricCard label="Active Agents" value={intelligenceMetrics.activeAgents} accent="tertiary" suffix="U" />
          <MetricCard label="Risk Vector" value={intelligenceMetrics.riskVector} accent="danger" suffix="DELTA" />
        </div>
      </header>

      <div className="intelligence-grid">
        <section className="panel intelligence-hero">
          <div className="panel-topline">
            <div>
              <h2>Neural Map</h2>
              <p>LIVE_VIEW_04</p>
            </div>
            <div className="hero-actions">
              <button type="button" className="icon-button subtle">
                <span className="material-symbols-outlined">zoom_in</span>
              </button>
              <button type="button" className="icon-button subtle">
                <span className="material-symbols-outlined">filter_list</span>
              </button>
            </div>
          </div>

          <div className="neural-map">
            <div className="neural-rings" />
            <div className="neural-rings secondary" />
            <div className="neural-center" />
            <div className="neural-node node-a" />
            <div className="neural-node node-b" />
            <div className="neural-node node-c" />
            <div className="neural-node node-d" />
            <div className="neural-node node-e" />
            <div className="neural-connection connection-a" />
            <div className="neural-connection connection-b" />
            <div className="neural-connection connection-c" />
            <div className="neural-connection connection-d" />

            {featuredNodes.map((node, index) => (
              <article
                key={node.name}
                className={index === 0 ? "neural-callout callout-left" : "neural-callout callout-right"}
                style={{ "--node-accent": node.accent }}
              >
                <p>{index === 0 ? "Node_Primary" : "Subroutine_Alpha"}</p>
                <strong>{node.label}</strong>
                <span>{index === 0 ? `LOAD: ${node.load}` : `STABILITY: ${node.health}`}</span>
              </article>
            ))}
          </div>

          <div className="panel-footer status-row">
            <span>
              <i />
              ACTIVE_NODES: {intelligenceMetrics.activeNodes}
            </span>
            <span>
              <i className="accent" />
              BOTTLENECKS: {intelligenceMetrics.bottlenecks}
            </span>
            <strong>REFRESH_RATE: 60HZ</strong>
          </div>
        </section>

        <section className="intelligence-side">
          <div className="panel semantic-panel">
            <div className="panel-topline">
              <div>
                <h2>Semantic Stream</h2>
                <p>Live process feed</p>
              </div>
              <span className="material-symbols-outlined telemetry-icon">sensors</span>
            </div>

            <div className="semantic-list">
              {semanticStream.map((item) => (
                <article key={item.id} className={`semantic-item tone-${item.tone}`}>
                  <div className="semantic-meta">
                    <span>{item.label}</span>
                    <strong>{item.timestamp}</strong>
                  </div>
                  <p>{item.message}</p>
                </article>
              ))}
            </div>

            <div className="panel-footer center-link">
              <button type="button">View All Intelligence</button>
            </div>
          </div>

          <div className="panel load-panel">
            <div className="load-copy">
              <h3>System Load</h3>
              <strong>{intelligenceMetrics.systemLoad}</strong>
            </div>
            <div className="load-bars">
              {intelligenceMetrics.sparkline.map((height, index) => (
                <span key={`${height}-${index}`} style={{ height }} />
              ))}
            </div>
          </div>
        </section>

        <section className="panel timeline-panel">
          <div className="panel-topline">
            <div>
              <h2>Inference Timeline</h2>
              <p>Historical prediction accuracy vs realized outcomes</p>
            </div>
            <div className="legend-row">
              <span className="legend-item prediction">Prediction</span>
              <span className="legend-item actual">Actual</span>
            </div>
          </div>

          <div className="inference-timeline">
            {timelinePoints.map((point) => (
              <div key={point.label} className="timeline-point">
                <div className="timeline-line" style={{ "--predicted": `${point.predicted}%`, "--actual": `${point.actual}%` }}>
                  <span className="marker predicted" />
                  <span className="marker actual" />
                </div>
                <span>{point.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent, suffix }) {
  return (
    <article className={`metric-card accent-${accent}`}>
      <p>{label}</p>
      <div>
        <strong>{value}</strong>
        <span>{suffix}</span>
      </div>
    </article>
  );
}

export default IntelligenceView;
