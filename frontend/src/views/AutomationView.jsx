import { useMemo } from "react";

function AutomationView({ scenarioTitle, autonomyStatus, autonomyBusy, autonomyError, onRunAutonomy }) {
  const watchProfiles = autonomyStatus?.watch_profiles ?? [];
  const recentRuns = autonomyStatus?.recent_runs ?? [];
  const recentActions = autonomyStatus?.recent_actions ?? [];
  const openTasks = autonomyStatus?.open_tasks ?? [];
  const latestRun = recentRuns[0] ?? null;

  const schedulerMode = autonomyStatus?.scheduler_mode || "Loading monitor status";
  const nextRunHint =
    autonomyStatus?.next_run_hint || "The monitor checks watched businesses regularly and logs any action it takes.";
  const monitorLabel = autonomyStatus?.background_running ? "Live monitor active" : "Monitor ready";

  const orderedActions = useMemo(() => [...recentActions].slice(0, 12), [recentActions]);
  const orderedRuns = useMemo(() => [...recentRuns].slice(0, 8), [recentRuns]);
  const orderedTasks = useMemo(() => [...openTasks].slice(0, 8), [openTasks]);

  return (
    <div className="command-canvas">
      <header className="view-header automation-header">
        <div>
          <div className="view-kicker-row">
            <span className={autonomyStatus?.background_running ? "status-chip success" : "status-chip outline"}>
              {monitorLabel}
            </span>
            <span className="muted-code">{schedulerMode}</span>
          </div>
          <h1>Automation Actions</h1>
          <p>
            This page shows what the autonomous monitor checked, what actions it took, and why those actions were taken for{" "}
            {scenarioTitle}.
          </p>
        </div>

        <div className="metric-strip">
          <MetricCard label="Watched businesses" value={watchProfiles.length} accent="finance" />
          <MetricCard label="Actions logged" value={recentActions.length} accent="accent" />
          <MetricCard label="Open tasks" value={openTasks.length} accent="tertiary" />
          <MetricCard label="Last scan size" value={latestRun?.watches_scanned ?? 0} accent="danger" />
        </div>
      </header>

      <div className="automation-grid">
        <section className="panel automation-status-panel">
          <div className="panel-topline">
            <div>
              <h2>Monitor Control</h2>
              <p>Run now or wait for the next scheduled cycle</p>
            </div>
            <button type="button" className="status-chip accent legend-button" onClick={onRunAutonomy} disabled={autonomyBusy}>
              {autonomyBusy ? "Running..." : "Run monitor now"}
            </button>
          </div>

          {autonomyError ? <p className="autonomy-error">{autonomyError}</p> : null}

          <div className="automation-status-stack">
            <article className="automation-status-item">
              <span>Next cycle</span>
              <strong>{nextRunHint}</strong>
            </article>
            <article className="automation-status-item">
              <span>Latest run</span>
              <strong>
                {latestRun
                  ? `${latestRun.watches_scanned} businesses scanned, ${latestRun.actions_taken} actions logged`
                  : "No monitor runs yet. Run a cycle to start tracking actions."}
              </strong>
            </article>
          </div>

          <div className="automation-runs">
            <h3>Recent runs</h3>
            {orderedRuns.length ? (
              orderedRuns.map((run) => (
                <article key={run.id} className="automation-run-item">
                  <div>
                    <strong>{run.summary || "Monitor run completed"}</strong>
                    <span>{formatDateTime(run.completed_at || run.started_at)}</span>
                  </div>
                  <p>
                    {run.watches_scanned} scanned · {run.actions_taken} actions · {run.trigger_source}
                  </p>
                </article>
              ))
            ) : (
              <p className="autonomy-empty">No monitor runs yet.</p>
            )}
          </div>
        </section>

        <section className="panel automation-watch-panel">
          <div className="panel-topline">
            <div>
              <h2>Watched Businesses</h2>
              <p>Live signals from each tracked business case</p>
            </div>
          </div>

          <div className="automation-watch-list">
            {watchProfiles.length ? (
              watchProfiles.map((watch) => (
                <article key={watch.id} className="automation-watch-card">
                  <div className="automation-watch-head">
                    <strong>{watch.label}</strong>
                    <span className={watch.active ? "status-chip success" : "status-chip outline"}>
                      {watch.active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p>{watch.latest_signal_summary}</p>
                  <small>
                    Last outcome: {watch.last_outcome || "No action yet"} · Last check:{" "}
                    {watch.last_checked_at ? formatDateTime(watch.last_checked_at) : "Not checked yet"}
                  </small>
                </article>
              ))
            ) : (
              <p className="autonomy-empty">No watched businesses yet.</p>
            )}
          </div>
        </section>

        <section className="panel automation-action-panel">
          <div className="panel-topline">
            <div>
              <h2>Action History</h2>
              <p>What the system did and why</p>
            </div>
          </div>

          <div className="automation-action-log">
            {orderedActions.length ? (
              orderedActions.map((action) => (
                <article key={action.id} className={`autonomy-action-item tone-${action.status}`}>
                  <div className="automation-action-head">
                    <p>{action.title}</p>
                    <span className={statusChipClass(action.status)}>{toStatusLabel(action.status)}</span>
                  </div>
                  <span>{action.watch_label}</span>
                  <small>{action.reason}</small>
                </article>
              ))
            ) : (
              <p className="autonomy-empty">No automatic actions logged yet.</p>
            )}
          </div>
        </section>

        <section className="panel automation-task-panel">
          <div className="panel-topline">
            <div>
              <h2>Open Follow-ups</h2>
              <p>Tasks created by automatic actions</p>
            </div>
          </div>

          <div className="automation-task-list">
            {orderedTasks.length ? (
              orderedTasks.map((task) => (
                <article key={task.id} className="automation-task-item">
                  <strong>{task.title}</strong>
                  <span>{task.watch_label}</span>
                  <p>{task.description}</p>
                </article>
              ))
            ) : (
              <p className="autonomy-empty">No open follow-up tasks right now.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }) {
  return (
    <article className={`metric-card accent-${accent}`}>
      <p>{label}</p>
      <div>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function toStatusLabel(status) {
  if (status === "executed") {
    return "Done";
  }
  if (status === "failed") {
    return "Failed";
  }
  return "Skipped";
}

function statusChipClass(status) {
  if (status === "executed") {
    return "status-chip success";
  }
  if (status === "failed") {
    return "status-chip danger";
  }
  return "status-chip outline";
}

function formatDateTime(value) {
  if (!value) {
    return "Unknown time";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export default AutomationView;
