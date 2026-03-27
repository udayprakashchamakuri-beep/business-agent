import { useState } from "react";

function RiskView({ riskMetrics, riskAlerts }) {
  const [shockIntensity, setShockIntensity] = useState(75);
  const [autonomyMode, setAutonomyMode] = useState("balanced");

  return (
    <div className="command-canvas">
      <header className="view-header risk-header">
        <div>
          <div className="view-kicker-row">
            <span className="status-chip danger">SECURITY LEVEL: OMEGA</span>
            <span className="risk-line" />
          </div>
          <h1>Risk Monitor</h1>
        </div>

        <div className="risk-score">
          <span>Global Stability Index</span>
          <strong>
            {riskMetrics.globalIndex}
            <small>{riskMetrics.delta}</small>
          </strong>
        </div>
      </header>

      <div className="risk-grid">
        <section className="panel threat-map-panel">
          <div className="map-overlay map-overlay-top">
            <article className="threat-badge danger">
              <span>Active Threat</span>
              <strong>{riskMetrics.activeThreat}</strong>
            </article>
            <article className="threat-badge accent">
              <span>Observation</span>
              <strong>{riskMetrics.observation}</strong>
            </article>
          </div>

          <div className="threat-map">
            <div className="scan-layer" />
            <div className="threat-orb orb-a" />
            <div className="threat-orb orb-b" />
            <div className="threat-orb orb-c" />
            <div className="threat-grid-lines" />
          </div>

          <div className="map-overlay map-overlay-bottom">
            <button type="button">Zoom In</button>
            <button type="button">Zoom Out</button>
            <button type="button">Layer Satellite</button>
          </div>
        </section>

        <section className="risk-feed">
          <div className="panel-topline">
            <div>
              <h2>Critical Alerts</h2>
              <p>Live feed</p>
            </div>
            <span className="live-feed-dot">LIVE_FEED</span>
          </div>

          <div className="risk-alert-list">
            {riskAlerts.map((alert) => (
              <article key={alert.id} className={`risk-alert tone-${alert.tone}`}>
                <div className="risk-alert-meta">
                  <span>{alert.timestamp}</span>
                  <strong>{alert.severity}</strong>
                </div>
                <h3>{alert.title}</h3>
                <p>{alert.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel volatility-panel">
          <div className="panel-topline">
            <div>
              <h2>Volatility Index</h2>
              <p>Real-time predictive delta</p>
            </div>
            <div className="legend-row">
              <span className="status-chip outline">1H</span>
              <span className="status-chip accent">4H</span>
              <span className="status-chip outline">1D</span>
            </div>
          </div>

          <div className="volatility-chart">
            <svg viewBox="0 0 800 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="volatilityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffe16d" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#ffe16d" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 150 Q 50 140, 100 160 T 200 120 T 300 140 T 400 80 T 500 100 T 600 40 T 700 60 T 800 20"
                fill="none"
                stroke="#ffe16d"
                strokeWidth="2"
              />
              <path
                d="M0 150 Q 50 140, 100 160 T 200 120 T 300 140 T 400 80 T 500 100 T 600 40 T 700 60 T 800 20 L 800 200 L 0 200 Z"
                fill="url(#volatilityGradient)"
              />
            </svg>
            <div className="volatility-marker" />
          </div>

          <div className="volatility-stats">
            {riskMetrics.stats.map((stat) => (
              <article key={stat.label}>
                <span>{stat.label}</span>
                <strong className={stat.tone === "success" ? "success-text" : ""}>{stat.value}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="panel sandbox-panel">
          <div className="panel-topline">
            <div>
              <h2>Simulation Sandbox</h2>
              <p>Hypothetical shock controls</p>
            </div>
            <span className="material-symbols-outlined tertiary-icon">science</span>
          </div>

          <div className="sandbox-stack">
            <label className="slider-block">
              <div>
                <span>Market Shock Intensity</span>
                <strong>{shockIntensity}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={shockIntensity}
                onChange={(event) => setShockIntensity(Number(event.target.value))}
              />
            </label>

            <div className="choice-block">
              <div>
                <span>Agent Autonomy Level</span>
                <strong>{autonomyMode}</strong>
              </div>
              <div className="choice-row">
                {["safe", "balanced", "aggressive"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={autonomyMode === mode ? "mode-button active" : "mode-button"}
                    onClick={() => setAutonomyMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <article className="active-scenario">
              <span>Active Scenario</span>
              <div>
                <i className="material-symbols-outlined">emergency_share</i>
                <div>
                  <strong>Total Grid De-synchronization</strong>
                  <p>Estimated Recovery: 144 Hours</p>
                </div>
              </div>
            </article>

            <button type="button" className="execute-shock">
              Execute Hypothetical Shock
            </button>
          </div>
        </section>
      </div>

      <section className="risk-kpi-grid">
        {riskMetrics.indicators.map((indicator) => (
          <article key={indicator.label} className={`risk-kpi tone-${indicator.tone}`}>
            <span>{indicator.label}</span>
            <strong>{indicator.value}</strong>
          </article>
        ))}
      </section>

      <footer className="command-footer">
        <div>
          <span className="command-footer-live">
            <i />
            System_Nominal
          </span>
          <span>Lat: 34.0522 deg N | Long: 118.2437 deg W</span>
        </div>
        <div>
          <span>Encrypted_Session: 88-X-19</span>
          <span>v.4.0.8-CMD</span>
        </div>
      </footer>
    </div>
  );
}

export default RiskView;
