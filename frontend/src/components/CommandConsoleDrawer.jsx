function CommandConsoleDrawer({
  consoleOpen,
  form,
  loading,
  error,
  onClose,
  onSubmit,
  onApplySample,
  onFieldChange,
}) {
  return (
    <div className={consoleOpen ? "console-drawer open" : "console-drawer"}>
      <div className="console-shell">
        <div className="console-top">
          <div>
            <span className="console-kicker">Command Console</span>
            <h2>Inject a strategic problem into the simulator</h2>
          </div>
          <button type="button" className="secondary-action" onClick={onClose}>
            Dismiss
          </button>
        </div>

        <form className="console-form" onSubmit={onSubmit}>
          <div className="console-grid two">
            <label>
              Company
              <input value={form.company_name} onChange={(event) => onFieldChange("company_name", event.target.value)} />
            </label>
            <label>
              Stage
              <input value={form.company_stage} onChange={(event) => onFieldChange("company_stage", event.target.value)} />
            </label>
            <label>
              Industry
              <input value={form.industry} onChange={(event) => onFieldChange("industry", event.target.value)} />
            </label>
            <label>
              Region
              <input value={form.region} onChange={(event) => onFieldChange("region", event.target.value)} />
            </label>
          </div>

          <label>
            Business problem
            <textarea
              rows="6"
              value={form.business_problem}
              onChange={(event) => onFieldChange("business_problem", event.target.value)}
            />
          </label>

          <div className="console-grid two">
            <label>
              Objectives
              <textarea rows="3" value={form.objectives} onChange={(event) => onFieldChange("objectives", event.target.value)} />
            </label>
            <label>
              Constraints
              <textarea
                rows="3"
                value={form.current_constraints}
                onChange={(event) => onFieldChange("current_constraints", event.target.value)}
              />
            </label>
          </div>

          <div className="console-grid four">
            <label>
              Runway (months)
              <input value={form.runway_months} onChange={(event) => onFieldChange("runway_months", event.target.value)} />
            </label>
            <label>
              Gross margin
              <input value={form.gross_margin} onChange={(event) => onFieldChange("gross_margin", event.target.value)} />
            </label>
            <label>
              CAC payback
              <input
                value={form.cac_payback_months}
                onChange={(event) => onFieldChange("cac_payback_months", event.target.value)}
              />
            </label>
            <label>
              Price point
              <input value={form.price_point} onChange={(event) => onFieldChange("price_point", event.target.value)} />
            </label>
          </div>

          {error ? <p className="console-error">{error}</p> : null}

          <div className="console-actions">
            <button type="button" className="secondary-action" onClick={onApplySample}>
              Load Sample
            </button>
            <button type="submit" className="primary-action" disabled={loading}>
              {loading ? "Running board debate..." : "Launch simulation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CommandConsoleDrawer;
