import { useEffect, useMemo, useState } from "react";

function RiskView({ riskMetrics, riskAlerts }) {
  const [shockIntensity, setShockIntensity] = useState(75);
  const [autonomyMode, setAutonomyMode] = useState("balanced");
  const [mapZoom, setMapZoom] = useState(1);
  const [mapView, setMapView] = useState("world");
  const [timeRange, setTimeRange] = useState("4H");
  const [selectedAlertId, setSelectedAlertId] = useState(riskAlerts[0]?.id ?? "");
  const [simulationResult, setSimulationResult] = useState(null);

  const displayAlerts = useMemo(() => {
    const combined = simulationResult?.alert ? [simulationResult.alert, ...riskAlerts] : riskAlerts;
    const seen = new Set();
    return combined.filter((alert) => {
      if (!alert || seen.has(alert.id)) {
        return false;
      }
      seen.add(alert.id);
      return true;
    });
  }, [riskAlerts, simulationResult]);

  useEffect(() => {
    if (!displayAlerts.length) {
      setSelectedAlertId("");
      return;
    }
    if (!displayAlerts.some((alert) => alert.id === selectedAlertId)) {
      setSelectedAlertId(displayAlerts[0].id);
    }
  }, [displayAlerts, selectedAlertId]);

  const selectedAlert = useMemo(
    () => displayAlerts.find((alert) => alert.id === selectedAlertId) ?? displayAlerts[0] ?? null,
    [displayAlerts, selectedAlertId],
  );

  const chartConfig = useMemo(() => {
    if (timeRange === "1H") {
      return {
        path: "M0 146 Q 80 142, 120 138 T 220 130 T 320 122 T 420 116 T 520 98 T 640 86 T 800 74",
        markerTop: "34px",
        label: "Short-term change",
      };
    }
    if (timeRange === "1D") {
      return {
        path: "M0 158 Q 70 146, 140 152 T 260 126 T 380 150 T 520 96 T 660 118 T 800 48",
        markerTop: "46px",
        label: "Daily trend",
      };
    }
    return {
      path: "M0 150 Q 50 140, 100 160 T 200 120 T 300 140 T 400 80 T 500 100 T 600 40 T 700 60 T 800 20",
      markerTop: "18px",
      label: "Four-hour trend",
    };
  }, [timeRange]);

  const activeChart = simulationResult?.chart ?? chartConfig;
  const activeStats = simulationResult?.stats ?? riskMetrics.stats;
  const activeThreat = simulationResult?.activeThreat ?? riskMetrics.activeThreat;
  const observation = simulationResult?.observation ?? riskMetrics.observation;

  const mapViewLabel =
    mapView === "world" ? "Overall risk picture" : mapView === "hotspots" ? "Main risk hotspots" : "Operations and supply risks";
  const mapSummary =
    mapView === "world"
      ? "This view shows the full launch path. The dashed line shows how risk builds from early launch to later scale."
      : mapView === "hotspots"
        ? "This view highlights the places where the biggest problems could hit first. Larger red dots need the fastest action."
        : "This view focuses on delivery, staffing, and supply-side risks that could slow the plan down.";
  const zoomLabel = `${Math.round(mapZoom * 100)}%`;
  const mapLegendItems = [
    { label: "High concern", tone: "danger" },
    { label: "Watch closely", tone: "accent" },
    { label: "Stable area", tone: "success" },
  ];
  const mapDiagram = useMemo(() => {
    if (mapView === "hotspots") {
      return {
        paths: [
          "M 110 170 C 230 110, 300 110, 410 170",
          "M 410 170 C 520 220, 630 210, 730 130",
        ],
        nodes: [
          { x: 110, y: 170, size: 10, tone: "danger", label: "Student footfall", dx: -34, dy: -18 },
          { x: 270, y: 130, size: 8, tone: "accent", label: "Event demand", dx: -26, dy: -18 },
          { x: 410, y: 170, size: 12, tone: "danger", label: "Rent pressure", dx: -22, dy: 28 },
          { x: 560, y: 210, size: 8, tone: "accent", label: "Upkeep cost", dx: -16, dy: 28 },
          { x: 730, y: 130, size: 10, tone: "danger", label: "Cash drain", dx: -18, dy: -18 },
        ],
      };
    }

    if (mapView === "supply") {
      return {
        paths: [
          "M 120 200 L 240 155 L 410 175 L 540 120 L 710 165",
          "M 240 155 L 300 245 L 450 250 L 540 120",
        ],
        nodes: [
          { x: 120, y: 200, size: 8, tone: "success", label: "Snack supply", dx: -24, dy: 26 },
          { x: 240, y: 155, size: 10, tone: "accent", label: "PC setup", dx: -16, dy: -18 },
          { x: 300, y: 245, size: 8, tone: "success", label: "Repairs", dx: -12, dy: 26 },
          { x: 410, y: 175, size: 10, tone: "accent", label: "Staff cover", dx: -18, dy: -18 },
          { x: 540, y: 120, size: 12, tone: "danger", label: "Peak downtime", dx: -24, dy: -18 },
          { x: 710, y: 165, size: 8, tone: "success", label: "Recovery", dx: -12, dy: 26 },
        ],
      };
    }

    return {
      paths: [
        "M 120 150 C 220 95, 340 110, 420 180",
        "M 420 180 C 500 240, 620 225, 710 145",
        "M 260 260 C 330 210, 420 205, 520 245",
      ],
      nodes: [
        { x: 120, y: 150, size: 8, tone: "accent", label: "Fit-out spend", dx: -20, dy: -18 },
        { x: 250, y: 115, size: 6, tone: "success", label: "Demand test", dx: -18, dy: -18 },
        { x: 420, y: 180, size: 12, tone: "danger", label: "Launch strain", dx: -18, dy: 28 },
        { x: 580, y: 230, size: 8, tone: "accent", label: "Staffing gap", dx: -20, dy: 28 },
        { x: 710, y: 145, size: 10, tone: "danger", label: "Cash pressure", dx: -20, dy: -18 },
        { x: 320, y: 230, size: 6, tone: "success", label: "Ops check", dx: -12, dy: 28 },
      ],
    };
  }, [mapView]);

  function zoomIn() {
    setMapZoom((current) => Math.min(1.6, Number((current + 0.15).toFixed(2))));
  }

  function zoomOut() {
    setMapZoom((current) => Math.max(0.8, Number((current - 0.15).toFixed(2))));
  }

  function changeView() {
    setMapView((current) => (current === "world" ? "hotspots" : current === "hotspots" ? "supply" : "world"));
  }

  function runSimulation() {
    const simulationId = `simulation-${Date.now()}`;
    const intensityBand = shockIntensity >= 80 ? "high" : shockIntensity >= 55 ? "medium" : "low";
    const nextRange = intensityBand === "high" ? "1H" : intensityBand === "medium" ? "4H" : "1D";
    const nextView = intensityBand === "high" ? "hotspots" : intensityBand === "low" ? "supply" : "world";
    const nextZoom = intensityBand === "high" ? 1.25 : intensityBand === "low" ? 1.05 : 1.12;

    setTimeRange(nextRange);
    setMapView(nextView);
    setMapZoom(nextZoom);

    const alertTone = intensityBand === "high" ? "danger" : intensityBand === "medium" ? "accent" : "success";
    const alertTitle =
      intensityBand === "high"
        ? "Stress test found a fragile launch path"
        : intensityBand === "medium"
          ? "Stress test found a manageable but real risk spike"
          : "Stress test shows the plan holds up under this case";
    const alertBody =
      intensityBand === "high"
        ? `This test suggests the current plan becomes fragile when market difficulty rises to ${shockIntensity}% with ${autonomyMode} advisor freedom. The business would need tighter controls before moving ahead.`
        : intensityBand === "medium"
          ? `This test suggests the plan can still work, but only if the team narrows the launch and watches spending carefully.`
          : `This test suggests the current plan stays fairly steady under lighter stress, with the main watch-out being execution discipline.`;

    setSimulationResult({
      alert: {
        id: simulationId,
        timestamp: "Just now",
        severity: intensityBand === "high" ? "Critical test result" : intensityBand === "medium" ? "Watch item" : "Stable test result",
        title: alertTitle,
        body: alertBody,
        tone: alertTone,
      },
      chart:
        intensityBand === "high"
          ? {
              path: "M0 165 Q 70 154, 130 168 T 250 132 T 370 152 T 510 82 T 650 58 T 800 26",
              markerTop: "24px",
              label: "Stress-test spike",
            }
          : intensityBand === "medium"
            ? {
                path: "M0 154 Q 80 146, 160 152 T 280 128 T 420 118 T 560 92 T 800 66",
                markerTop: "38px",
                label: "Scenario pressure trend",
              }
            : {
                path: "M0 166 Q 100 158, 200 150 T 360 138 T 520 128 T 800 102",
                markerTop: "60px",
                label: "Lower-stress trend",
              },
      activeThreat: intensityBand === "high" ? "STRESS TEST PRESSURE" : activeThreat,
      observation:
        intensityBand === "high"
          ? "LAUNCH PLAN TOO FRAGILE"
          : intensityBand === "medium"
            ? "NARROWER LAUNCH ADVISED"
            : "TEST CASE HOLDS",
      stats: [
        { label: "Risk change", value: intensityBand === "high" ? "18.4%" : intensityBand === "medium" ? "11.6%" : "5.2%" },
        { label: "Response speed", value: `${Math.max(10, 28 - Math.round(shockIntensity / 8))}ms` },
        { label: "System load", value: intensityBand === "high" ? "Under strain" : intensityBand === "medium" ? "Watch" : "Healthy", tone: intensityBand === "low" ? "success" : undefined },
        { label: "Resilience score", value: intensityBand === "high" ? "72.4" : intensityBand === "medium" ? "84.9" : "92.7" },
      ],
      summary:
        intensityBand === "high"
          ? `The system ran a severe stress test. It is highlighting a fragile launch path and showing the sharpest pressure in the risk trend and alert feed.`
          : intensityBand === "medium"
            ? `The system ran a medium stress test. It still sees a workable path, but only with a smaller launch and tighter controls.`
            : `The system ran a lighter stress test. The plan stayed fairly steady, with execution discipline still the main thing to watch.`,
    });
    setSelectedAlertId(simulationId);
  }

  return (
    <div className="command-canvas">
      <header className="view-header risk-header">
        <div>
          <div className="view-kicker-row">
            <span className="status-chip danger">HIGH ATTENTION</span>
            <span className="risk-line" />
          </div>
          <h1>Risks To Watch</h1>
        </div>

        <div className="risk-score">
          <span>Overall business safety</span>
          <strong>
            {riskMetrics.globalIndex}
            <small>{riskMetrics.delta}</small>
          </strong>
        </div>
      </header>

      <div className="risk-grid">
        <section className="panel threat-map-panel">
          <div className="panel-topline threat-map-topline">
            <div>
              <h2>Risk Path</h2>
              <p>Read left to right through the launch. Higher points mean more pressure.</p>
            </div>
            <div className="threat-mini-guide">
              <span>Red means urgent</span>
              <span>Yellow means watch closely</span>
            </div>
          </div>

          <div className="map-overlay map-overlay-top">
            <article className="threat-badge danger">
              <span>Main risk</span>
              <strong>{activeThreat}</strong>
            </article>
            <article className="threat-badge accent">
              <span>Watch item</span>
              <strong>{observation}</strong>
            </article>
          </div>

          <div className="threat-map">
            <div className={`threat-map-inner view-${mapView}`} style={{ transform: `scale(${mapZoom})` }}>
              <div className="scan-layer" />
              <div className="threat-orb orb-a" />
              <div className="threat-orb orb-b" />
              <div className="threat-orb orb-c" />
              <div className="threat-grid-lines" />
              <div className="threat-axis axis-top">Higher risk</div>
              <div className="threat-axis axis-bottom">Lower risk</div>
              <div className="threat-axis axis-left">Early launch</div>
              <div className="threat-axis axis-right">Later scale</div>
              <svg className="threat-map-svg" viewBox="0 0 800 320" preserveAspectRatio="none" aria-hidden="true">
                {mapDiagram.paths.map((path, index) => (
                  <path key={index} d={path} className="threat-map-path" />
                ))}
                {mapDiagram.nodes.map((node, index) => (
                  <g key={`${node.x}-${node.y}-${index}`} className="threat-map-point">
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.size}
                      className={`threat-map-node tone-${node.tone}`}
                    />
                    {node.label ? (
                      <text
                        x={node.x + (node.dx ?? 0)}
                        y={node.y + (node.dy ?? 0)}
                        className={`threat-map-label tone-${node.tone}`}
                      >
                        {node.label}
                      </text>
                    ) : null}
                  </g>
                ))}
              </svg>
            </div>
          </div>

          <div className="threat-map-footer">
            <div className="threat-map-caption">
              <strong>{mapViewLabel}</strong>
              <span>{simulationResult?.summary ?? mapSummary}</span>
            </div>
            <div className="threat-map-legend">
              {mapLegendItems.map((item) => (
                <span key={item.label} className="legend-pill">
                  <i className={`legend-dot tone-${item.tone}`} />
                  {item.label}
                </span>
              ))}
            </div>
            <div className="map-control-row">
              <span className="map-status-chip">{mapViewLabel}</span>
              <span className="map-status-chip">{zoomLabel}</span>
              <button type="button" className="map-control" onClick={zoomIn}>Zoom In</button>
              <button type="button" className="map-control" onClick={zoomOut}>Zoom Out</button>
              <button type="button" className="map-control active" onClick={changeView}>Change view</button>
            </div>
          </div>
        </section>

        <section className="risk-feed">
          <div className="panel-topline">
            <div>
              <h2>Important Alerts</h2>
              <p>Live feed</p>
            </div>
            <span className="live-feed-dot">LIVE</span>
          </div>

          <div className="risk-alert-list">
            {displayAlerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                className={selectedAlertId === alert.id ? `risk-alert tone-${alert.tone} active` : `risk-alert tone-${alert.tone}`}
                onClick={() => setSelectedAlertId(alert.id)}
              >
                <div className="risk-alert-meta">
                  <span>{alert.timestamp}</span>
                  <strong>{alert.severity}</strong>
                </div>
                <h3>{alert.title}</h3>
                <p>{alert.body}</p>
              </button>
            ))}
          </div>

          {selectedAlert ? (
            <article className={`alert-detail tone-${selectedAlert.tone}`}>
              <div className="panel-topline">
                <div>
                  <h2>Selected Alert</h2>
                  <p>{selectedAlert.timestamp}</p>
                </div>
                <span className="status-chip outline">{selectedAlert.severity}</span>
              </div>
              <strong>{selectedAlert.title}</strong>
              <p>{selectedAlert.body}</p>
            </article>
          ) : null}
        </section>

        <section className="panel volatility-panel">
          <div className="panel-topline">
            <div>
              <h2>Risk Trend</h2>
              <p>{activeChart.label}</p>
            </div>
            <div className="legend-row">
              {["1H", "4H", "1D"].map((range) => (
                <button
                  key={range}
                  type="button"
                  className={timeRange === range ? "status-chip accent legend-button active" : "status-chip outline legend-button"}
                  onClick={() => setTimeRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          <div className="volatility-chart">
            <div className="volatility-chart-grid" aria-hidden="true" />
            <svg viewBox="0 0 800 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="volatilityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffe16d" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#ffe16d" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={activeChart.path}
                fill="none"
                stroke="#ffe16d"
                strokeWidth="2"
              />
              <path
                d={`${activeChart.path} L 800 200 L 0 200 Z`}
                fill="url(#volatilityGradient)"
              />
            </svg>
            <div className="volatility-marker" style={{ top: activeChart.markerTop }} />
          </div>

          <div className="volatility-stats">
            {activeStats.map((stat) => (
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
              <h2>Scenario Tester</h2>
              <p>Try different conditions before deciding</p>
            </div>
            <span className="material-symbols-outlined tertiary-icon">science</span>
          </div>

          <div className="sandbox-stack">
            <label className="slider-block">
              <div>
                <span>How difficult the market becomes</span>
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
                <span>How much freedom the advisors have</span>
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
              <span>Current test case</span>
              <div>
                <i className="material-symbols-outlined">emergency_share</i>
                <div>
                  <strong>Major operating disruption</strong>
                  <p>Estimated recovery time: 144 hours</p>
                </div>
              </div>
            </article>

            <button type="button" className="execute-shock" onClick={runSimulation}>
              Run this test case
            </button>
            {simulationResult ? (
              <article className={`sandbox-result-card tone-${simulationResult.alert.tone}`}>
                <strong>{simulationResult.alert.title}</strong>
                <p>{simulationResult.summary}</p>
              </article>
            ) : (
              <p className="sandbox-result">Run the scenario tester to see how the chart, alert feed, and map change under new conditions.</p>
            )}
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
            System healthy
          </span>
          <span>Lat: 34.0522 deg N | Long: 118.2437 deg W</span>
        </div>
        <div>
          <span>Session: 88-X-19</span>
          <span>v4.0.8</span>
        </div>
      </footer>
    </div>
  );
}

export default RiskView;
