const STAGE_OPTIONS = [
  "Idea",
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B+",
  "Established business",
];

const REGION_OPTIONS = [
  "North America",
  "Europe",
  "India",
  "Asia-Pacific",
  "Latin America",
  "Middle East & Africa",
  "Global",
];

function CommandConsoleDrawer({
  consoleOpen,
  form,
  demoCases,
  selectedDemoCaseId,
  loading,
  error,
  onClose,
  onSubmit,
  onApplySample,
  onSelectDemoCase,
  onFieldChange,
}) {
  return (
    <div className={consoleOpen ? "console-drawer open" : "console-drawer"}>
      <div className="console-shell">
        <div className="console-top">
          <div>
            <span className="console-kicker">Business Question Form</span>
            <h2>Tell the advisory team what decision you need help with</h2>
            <p className="console-intro">
              Fill in what you know. Short answers and rough estimates are completely fine. If you prefer, you can close
              this panel and type your question directly on the Discussion page like a normal chat.
            </p>
          </div>
          <button type="button" className="secondary-action" onClick={onClose}>
            Use chat instead
          </button>
        </div>

        <form className="console-form" onSubmit={onSubmit}>
          <div className="form-section-heading">
            <h3>Try a demo case</h3>
            <p>Pick a ready-made business case if you want to test the analysis quickly.</p>
          </div>

          <div className="console-grid two">
            <label>
              Demo case
              <select value={selectedDemoCaseId} onChange={(event) => onSelectDemoCase(event.target.value)}>
                {demoCases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="field-help">
                {demoCases.find((item) => item.id === selectedDemoCaseId)?.summary ?? "Choose an example case to load."}
              </span>
            </label>
            <label className="demo-case-action">
              Load selected case
              <button type="button" className="secondary-action wide-secondary" onClick={() => onApplySample(selectedDemoCaseId)}>
                Use this demo case
              </button>
              <span className="field-help">This will fill the form with realistic demo data you can edit before running the analysis.</span>
            </label>
          </div>

          <div className="form-section-heading">
            <h3>1. Basic business details</h3>
            <p>Choose the options that are closest to your current situation.</p>
          </div>

          <div className="console-grid two">
            <label>
              Company
              <input
                placeholder="Example: HelixOps AI"
                value={form.company_name}
                onChange={(event) => onFieldChange("company_name", event.target.value)}
              />
              <span className="field-help">Use the company or product name you want the team to review.</span>
            </label>
            <label>
              Company stage
              <select value={form.company_stage} onChange={(event) => onFieldChange("company_stage", event.target.value)}>
                {STAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span className="field-help">Pick the stage that best matches where the business is today.</span>
            </label>
            <label>
              Industry
              <input
                placeholder="Example: Business software"
                value={form.industry}
                onChange={(event) => onFieldChange("industry", event.target.value)}
              />
              <span className="field-help">A simple label is enough, like software, retail, healthcare, or education.</span>
            </label>
            <label>
              Region
              <select value={form.region} onChange={(event) => onFieldChange("region", event.target.value)}>
                {REGION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span className="field-help">Choose the main market or geography this decision is about.</span>
            </label>
          </div>

          <div className="form-section-heading">
            <h3>2. The decision</h3>
            <p>Describe the choice in plain language. You do not need special business terms.</p>
          </div>

          <label>
            Business question
            <textarea
              rows="6"
              placeholder="Example: Should we launch our product in hospitals this year, or wait until we have better support and compliance in place?"
              value={form.business_problem}
              onChange={(event) => onFieldChange("business_problem", event.target.value)}
            />
            <span className="field-help">Write the main decision you are trying to make and what makes it difficult.</span>
          </label>

          <div className="console-grid two">
            <label>
              Goals
              <textarea
                rows="3"
                placeholder="Example: Grow revenue, enter a new market, reduce risk"
                value={form.objectives}
                onChange={(event) => onFieldChange("objectives", event.target.value)}
              />
              <span className="field-help">You can list a few goals separated by commas.</span>
            </label>
            <label>
              Limits or concerns
              <textarea
                rows="3"
                placeholder="Example: Small team, limited budget, long sales cycle"
                value={form.current_constraints}
                onChange={(event) => onFieldChange("current_constraints", event.target.value)}
              />
              <span className="field-help">List the biggest limits, worries, or blockers separated by commas.</span>
            </label>
          </div>

          <label>
            Extra background
            <textarea
              rows="3"
              placeholder="Optional: add customer context, recent changes, or anything else the team should know"
              value={form.extra_context}
              onChange={(event) => onFieldChange("extra_context", event.target.value)}
            />
            <span className="field-help">Optional. Add any plain-language notes that would help the team understand the situation.</span>
          </label>

          <div className="form-section-heading">
            <h3>3. Numbers you already know</h3>
            <p>If you do not know an exact number, an estimate is still helpful.</p>
          </div>

          <div className="console-grid four">
            <label>
              Cash runway (months)
              <input
                type="number"
                inputMode="numeric"
                placeholder="11"
                value={form.runway_months}
                onChange={(event) => onFieldChange("runway_months", event.target.value)}
              />
              <span className="field-help">About how many months you can operate before cash runs low.</span>
            </label>
            <label>
              Profit margin (%)
              <input
                type="number"
                inputMode="decimal"
                placeholder="68"
                value={form.gross_margin}
                onChange={(event) => onFieldChange("gross_margin", event.target.value)}
              />
              <span className="field-help">The percentage left after delivering the product or service.</span>
            </label>
            <label>
              Months to win back sales and marketing cost
              <input
                type="number"
                inputMode="decimal"
                placeholder="15"
                value={form.cac_payback_months}
                onChange={(event) => onFieldChange("cac_payback_months", event.target.value)}
              />
              <span className="field-help">How long it takes to recover what you spend to win a customer.</span>
            </label>
            <label>
              Price per customer
              <input
                type="number"
                inputMode="decimal"
                placeholder="28000"
                value={form.price_point}
                onChange={(event) => onFieldChange("price_point", event.target.value)}
              />
              <span className="field-help">Your current or expected price for one customer or contract.</span>
            </label>
          </div>

          <div className="console-divider">
            <span>Try another scenario</span>
          </div>

          <p className="console-subtle-copy">
            This part is optional. Use it if you want the team to test a different market or budget situation.
          </p>

          <div className="console-grid two">
            <label>
              Scenario name
              <input
                placeholder="Example: Lower-budget case"
                value={form.variation_name}
                onChange={(event) => onFieldChange("variation_name", event.target.value)}
              />
              <span className="field-help">Give this what-if case a short name.</span>
            </label>
            <label>
              Scenario notes
              <input
                placeholder="Example: Assume customers delay decisions and budgets shrink"
                value={form.variation_notes}
                onChange={(event) => onFieldChange("variation_notes", event.target.value)}
              />
              <span className="field-help">Add one sentence explaining what changes in this scenario.</span>
            </label>
          </div>

          <div className="console-grid four">
            <label>
              Budget change (%)
              <input
                type="number"
                inputMode="decimal"
                placeholder="-20"
                value={form.variation_budget_change_pct}
                onChange={(event) => onFieldChange("variation_budget_change_pct", event.target.value)}
              />
              <span className="field-help">Use negative for a cut and positive for an increase.</span>
            </label>
            <label>
              Market condition
              <select
                value={form.variation_market_condition}
                onChange={(event) => onFieldChange("variation_market_condition", event.target.value)}
              >
                <option value="base">Normal - buying behavior is typical</option>
                <option value="bearish">Tough - customers are more careful with spending</option>
                <option value="bullish">Strong - demand is rising and buyers move faster</option>
              </select>
              <span className="field-help">This tells the team whether the market feels steady, harder, or stronger than usual.</span>
            </label>
            <label>
              Competition level
              <select
                value={form.variation_competition_level}
                onChange={(event) => onFieldChange("variation_competition_level", event.target.value)}
              >
                <option value="low">Low - only a few serious competitors</option>
                <option value="medium">Medium - a normal amount of competition</option>
                <option value="high">High - many strong competitors</option>
              </select>
              <span className="field-help">Choose how crowded the market feels for this scenario.</span>
            </label>
            <label>
              Price change (%)
              <input
                type="number"
                inputMode="decimal"
                placeholder="-10"
                value={form.variation_pricing_change_pct}
                onChange={(event) => onFieldChange("variation_pricing_change_pct", event.target.value)}
              />
              <span className="field-help">Use negative for a discount and positive for a price increase.</span>
            </label>
          </div>

          {error ? <p className="console-error">{error}</p> : null}

          <div className="console-actions">
            <button type="button" className="secondary-action" onClick={() => onApplySample(selectedDemoCaseId)}>
              Load demo case
            </button>
            <button type="submit" className="primary-action" disabled={loading}>
              {loading ? "Reviewing your case..." : "Start analysis"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CommandConsoleDrawer;
