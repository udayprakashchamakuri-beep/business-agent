const REPLACEMENTS = [
  [/\bNO GO\b/g, "Do not launch yet"],
  [/\bMODIFY\b/g, "Move forward with changes"],
  [/\bGO\b/g, "Launch"],
  [/\bICP\b/g, "ideal customer"],
  [/\bCAC\b/g, "customer acquisition cost"],
  [/\bROI\b/g, "return on investment"],
  [/\bACV\b/g, "annual contract value"],
  [/\bTAM\b/g, "total market size"],
  [/\bGTM\b/g, "launch plan"],
  [/\bgo-to-market\b/gi, "launch plan"],
  [/\bunit economics\b/gi, "profitability per customer"],
  [/\bwedge\b/gi, "starting focus area"],
  [/\brunway\b/gi, "cash runway"],
  [/\bstop-loss\b/gi, "clear stop rule"],
  [/\bpipeline\b/gi, "sales pipeline"],
  [/\bpayback\b/gi, "time to earn the money back"],
  [/\bqualified leads\b/gi, "strong sales leads"],
  [/\bdesign partners\b/gi, "pilot customers"],
  [/\bcontribution margin\b/gi, "profit after direct costs"],
  [/\bprocurement\b/gi, "buying approval"],
  [/\bsegment\b/gi, "customer group"],
  [/\bboardroom\b/gi, "advisory team"],
  [/\bboard\b/gi, "team"],
  [/\blearning milestones\b/gi, "weekly checkpoints"],
  [/\bbuyer pain\b/gi, "customer need"],
  [/\bsharpest\b/gi, "most urgent"],
  [/\bstarting focus area\b/gi, "small first version"],
  [/\blaunch a 90-day\b/gi, "Start with a 90-day"],
];

const DECISION_LABELS = {
  GO: "Launch now",
  MODIFY: "Move forward with changes",
  "NO GO": "Do not launch yet",
};

const ADVISOR_BADGE_LABELS = {
  GO: "Positive",
  MODIFY: "Needs changes",
  "NO GO": "Cautious",
};

export function toPlainText(value) {
  if (!value || typeof value !== "string") {
    return value ?? "";
  }

  return REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), rewriteMachineText(value))
    .replace(/\s+/g, " ")
    .trim();
}

export function formatDecisionLabel(value) {
  return DECISION_LABELS[value] ?? toPlainText(value);
}

export function buildRoundSummary(turn) {
  if (!turn) {
    return "";
  }

  const stanceLine = buildStanceLine(turn);
  const researchLine = buildResearchLine(turn);
  const metricLine = buildMetricLine(turn, inferQuestionIntent(""));
  const actions = (turn.key_points ?? []).map((item) => toPlainText(item)).filter(Boolean);
  const actionLine = actions[0] ? normalizeSentence(actions[0]) : "";

  return [stanceLine, researchLine, metricLine, actionLine].filter(Boolean).join(" ");
}

export function buildDirectAdvisorReply(turn, question = "") {
  if (!turn) {
    return "";
  }

  const intent = inferQuestionIntent(question);
  const isDecisionQuestion = shouldShowAdvisorStanceBadge(question);
  const stanceLine = buildStanceLine(turn);
  const researchLine = buildResearchLine(turn);
  const metricLine = buildMetricLine(turn, intent);
  const actions = (turn.key_points ?? []).map((item) => toPlainText(item)).filter(Boolean);
  const supportingLine = actions[0] ? normalizeSentence(actions[0]) : "";
  const cautionLine = actions[1] ? normalizeSentence(actions[1]) : "";

  if (metricLine && supportingLine) {
    return [researchLine, metricLine, supportingLine, cautionLine].filter(Boolean).join(" ");
  }

  if (isDecisionQuestion) {
    return [stanceLine, researchLine, metricLine, supportingLine, cautionLine].filter(Boolean).join(" ");
  }

  return (
    [researchLine, metricLine, supportingLine, cautionLine].filter(Boolean).join(" ") ||
    researchLine ||
    supportingLine ||
    cautionLine ||
    metricLine
  );
}

export function shouldShowAdvisorStanceBadge(question = "") {
  const lower = String(question).toLowerCase();
  return /\bshould\b|\bshould we\b|\bdo you recommend\b|\brecommend\b|\bapprove\b|\bgo ahead\b|\blaunch\b|\bmove ahead\b|\bproceed\b|\bdecide\b|\bdecision\b|\bworth it\b/.test(
    lower,
  );
}

export function formatAdvisorStanceLabel(value) {
  return ADVISOR_BADGE_LABELS[value] ?? formatDecisionLabel(value);
}

export function inferQuestionIntent(question) {
  const lower = String(question).toLowerCase();

  return {
    asksForNumbers: /\bhow much\b|\bestimate\b|\bexpected\b|\bforecast\b|\bnumbers?\b|\bprojection\b/.test(lower),
    asksAboutSales: /\bsales|revenue|income|forecast|bookings|customers\b/.test(lower),
    asksAboutBudget: /\bbudget|cost|spend|expense|cash|runway|payback\b/.test(lower),
    asksAboutPricing: /\bprice|pricing|discount|charge\b/.test(lower),
    asksAboutHiring: /\bhire|hiring|team|staff|people\b/.test(lower),
    asksAboutRisk: /\brisk|safe|danger|concern|problem|compliance\b/.test(lower),
    asksAboutOperations: /\boperations|delivery|support|integration|capacity|fulfillment\b/.test(lower),
    asksAboutMarketing: /\bmarketing|ads|channels|message|campaign|demand\b/.test(lower),
  };
}

function buildStanceLine(turn) {
  if (turn.stance === "GO") {
    return "My view is that this can move ahead now.";
  }
  if (turn.stance === "MODIFY") {
    return "My view is that this can move ahead, but only with a few changes first.";
  }
  return "My view is that this should not move ahead yet.";
}

function buildMetricLine(turn, intent) {
  const metrics = turn.estimated_metrics ?? {};
  const annualRevenue = metrics.projected_annual_revenue;
  const customers = metrics.expected_customers_12m;
  const pricePoint = metrics.price_point;
  const launchBudget = metrics.launch_budget;
  const payback = metrics.estimated_payback_months;
  const runway = metrics.runway_months;
  const winRate = metrics.expected_win_rate_pct;
  const leads = metrics.monthly_leads_required;
  const grossMargin = metrics.gross_margin_pct;
  const pipelineValue = metrics.pipeline_value;
  const criticalHires = metrics.critical_hires_required;
  const riskPenalty = metrics.risk_penalty_pct;
  const fulfillmentStress = metrics.fulfillment_stress_pct;

  if (intent.asksAboutSales && annualRevenue) {
    const detailParts = [];

    if (customers) {
      detailParts.push(`roughly ${formatCount(customers)} customers`);
    }
    if (pricePoint) {
      detailParts.push(`at about ${formatCurrency(pricePoint)} each`);
    }

    const detailText = detailParts.length ? ` That assumes ${detailParts.join(" ")}.` : "";
    return `Based on the current assumptions, I would plan for about ${formatCurrency(annualRevenue)} in sales this year.${detailText}`;
  }

  if (intent.asksAboutBudget && launchBudget) {
    const bufferLine =
      runway && payback
        ? ` At the current pace, it would take about ${formatDuration(payback)} to earn that back, with about ${formatDuration(runway)} of cash runway assumed today.`
        : "";
    return `I would plan around ${formatCurrency(launchBudget)} in launch spending.${bufferLine}`;
  }

  if (intent.asksAboutPricing && pricePoint) {
    const marginLine = grossMargin ? ` with about ${formatPercent(grossMargin)} gross margin in the current model` : "";
    return `The current working price is about ${formatCurrency(pricePoint)} per customer${marginLine}.`;
  }

  if (intent.asksAboutHiring && criticalHires) {
    return `I would plan for about ${formatCount(criticalHires)} key hires before scaling this fully.`;
  }

  if (intent.asksAboutRisk && riskPenalty) {
    return `The current downside looks meaningful. In this model, the risk pressure is about ${formatPercent(riskPenalty)}.`;
  }

  if (intent.asksAboutOperations && fulfillmentStress) {
    return `Operations look stretched. The current model shows delivery pressure at about ${formatPercent(fulfillmentStress)}.`;
  }

  if (intent.asksAboutMarketing && leads && winRate) {
    return `To support this plan, marketing and sales would likely need about ${formatCount(leads)} good leads each month at roughly a ${formatPercent(winRate)} win rate.`;
  }

  if (intent.asksForNumbers && pipelineValue) {
    return `The current sales model points to about ${formatCurrency(pipelineValue)} in active pipeline value.`;
  }

  if (intent.asksForNumbers && annualRevenue && launchBudget) {
    return `Right now, the model points to about ${formatCurrency(annualRevenue)} in yearly sales against about ${formatCurrency(launchBudget)} in launch spending.`;
  }

  if (intent.asksForNumbers && grossMargin) {
    return `The current plan assumes about ${formatPercent(grossMargin)} gross margin.`;
  }

  return "";
}

function buildResearchLine(turn) {
  const points = (turn?.research_points ?? []).map((item) => toPlainText(item)).filter(Boolean);
  if (!points.length) {
    return "";
  }
  return normalizeSentence(points[0]);
}

function normalizeSentence(text) {
  const clean = String(text || "").trim();
  if (!clean) {
    return "";
  }

  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function rewriteMachineText(value) {
  let text = String(value);

  text = text.replace(
    /Weighted (?:board|team) sentiment normalized to ([+-]?\d+(?:\.\d+)?), with average modeled ROI of ([+-]?\d+(?:\.\d+)?)% and payback of ([+-]?\d+(?:\.\d+)?) months\./gi,
    (_, sentimentValue, roiValue, paybackValue) => {
      const sentiment = describeSentiment(Number(sentimentValue));
      const roi = Number(roiValue);
      const payback = Number(paybackValue);
      const returnLine =
        roi < 0
          ? `the current model points to a loss of about ${Math.abs(roi).toFixed(1)}%`
          : `the current model points to about ${roi.toFixed(1)}% return`;
      return `The team felt ${sentiment} overall. Based on the current assumptions, ${returnLine}, and it would take about ${payback.toFixed(1)} months to earn the upfront money back.`;
    },
  );

  text = text.replace(
    /The board landed on (GO|MODIFY|NO GO) because (.+?) carried the strongest aligned influence signal, while (.+?) shaped the operating conditions around that conclusion\. (.+)/gi,
    (_, decision, lead, others, conflict) =>
      `The team ended up at ${formatDecisionPhrase(decision)} mainly because ${lead} had the strongest influence. ${others} helped shape the conditions around that choice. ${normalizeSentence(conflict)}`,
  );

  text = text.replace(
    /The team ended up at (GO|MODIFY|NO GO) mainly because (.+?) had the strongest influence, while (.+?) helped shape the conditions and trade-offs around that choice\. (.+)/gi,
    (_, decision, lead, others, conflict) =>
      `The team ended up at ${formatDecisionPhrase(decision)} mainly because ${lead} had the strongest influence. ${others} helped shape the conditions around that choice. ${normalizeSentence(conflict)}`,
  );

  text = text.replace(
    /The heaviest disagreement centered on (.+?)\./gi,
    (_, topic) => `The biggest disagreement was about ${topic}.`,
  );

  text = text.replace(
    /Decision shifted from (GO|MODIFY|NO GO) to (GO|MODIFY|NO GO) because the (?:altered|new) assumptions changed (?:board|team) weighting\./gi,
    (_, fromDecision, toDecision) =>
      `After the assumptions changed, the final answer moved from ${formatDecisionPhrase(fromDecision)} to ${formatDecisionPhrase(toDecision)}.`,
  );

  text = text.replace(
    /The final answer changed from (GO|MODIFY|NO GO) to (GO|MODIFY|NO GO) because the new assumptions changed how the team weighed the trade-offs\./gi,
    (_, fromDecision, toDecision) =>
      `After the assumptions changed, the final answer moved from ${formatDecisionPhrase(fromDecision)} to ${formatDecisionPhrase(toDecision)}.`,
  );

  text = text.replace(
    /Decision stayed at (GO|MODIFY|NO GO), but (\d+) agents materially changed stance or confidence\./gi,
    (_, decision, count) =>
      `The final answer stayed at ${formatDecisionPhrase(decision)}, but ${count} advisors changed either their view or their confidence level.`,
  );

  text = text.replace(
    /The final answer stayed at (GO|MODIFY|NO GO), but (\d+) advisors changed either their view or their confidence level\./gi,
    (_, decision, count) =>
      `The final answer stayed at ${formatDecisionPhrase(decision)}, but ${count} advisors changed either their view or their confidence level.`,
  );

  text = text.replace(
    /Top influence shifted from (.+?) to (.+?) under the new assumptions\./gi,
    (_, fromAgent, toAgent) => `The most influential advisor changed from ${fromAgent} to ${toAgent} in this scenario.`,
  );

  text = text.replace(
    /The most influential advisor changed from (.+?) to (.+?) in this scenario\./gi,
    (_, fromAgent, toAgent) => `The most influential advisor changed from ${fromAgent} to ${toAgent} in this scenario.`,
  );

  text = text.replace(
    /(.+?) moved from (GO|MODIFY|NO GO) to (GO|MODIFY|NO GO) after the scenario assumptions changed\./gi,
    (_, agent, fromDecision, toDecision) =>
      `${agent} changed its recommendation from ${formatDecisionPhrase(fromDecision)} to ${formatDecisionPhrase(toDecision)} in this scenario.`,
  );

  text = text.replace(
    /(.+?) kept the same stance but confidence moved from (\d+)% to (\d+)%\./gi,
    (_, agent, fromConfidence, toConfidence) =>
      `${agent} kept the same overall view, but confidence changed from ${fromConfidence}% to ${toConfidence}%.`,
  );

  text = text.replace(/\bboard-level veto\b/gi, "strong stop signal from the team");
  return text;
}

function describeSentiment(value) {
  if (value >= 0.18) {
    return "mostly positive";
  }
  if (value >= 0.05) {
    return "slightly positive";
  }
  if (value > -0.05) {
    return "mixed";
  }
  if (value > -0.18) {
    return "slightly cautious";
  }
  return "strongly cautious";
}

function formatDecisionPhrase(value) {
  if (value === "GO") {
    return "launch now";
  }
  if (value === "MODIFY") {
    return "move forward with changes";
  }
  if (value === "NO GO") {
    return "hold off for now";
  }
  return String(value).toLowerCase();
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(Number(value));
}

function formatPercent(value) {
  return `${Number(value).toFixed(value >= 10 ? 0 : 1)}%`;
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(Number(value));
}

function formatDuration(value) {
  const rounded = Number(value);
  if (!Number.isFinite(rounded)) {
    return "";
  }
  return `${rounded.toFixed(rounded >= 10 ? 0 : 1)} months`;
}
