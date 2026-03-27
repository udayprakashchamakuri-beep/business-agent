export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const NAV_ITEMS = [
  { id: "simulation", label: "Simulation", icon: "hub" },
  { id: "intelligence", label: "Intelligence", icon: "psychology" },
  { id: "agents", label: "Agents", icon: "groups" },
  { id: "risk", label: "Risk", icon: "shield" },
];

export const AGENT_META = {
  "CEO Agent": {
    initials: "EX1",
    accent: "#ffe16d",
    symbol: "crown",
    label: "EXECUTIVE_ONE",
    title: "Strategic Oversight",
    boardRole: "Chief Executive Officer",
  },
  "Startup Builder Agent": {
    initials: "BLD",
    accent: "#ff9f59",
    symbol: "rocket_launch",
    label: "BUILD_FORGE",
    title: "Wedge Execution",
    boardRole: "Startup Builder",
  },
  "Market Research Agent": {
    initials: "RSH",
    accent: "#9ac9ff",
    symbol: "travel_explore",
    label: "MARKET_PULSE",
    title: "Sentiment Analysis",
    boardRole: "Market Research",
  },
  "Finance Agent": {
    initials: "FIN",
    accent: "#00ff94",
    symbol: "leaderboard",
    label: "FINANCE_CORE",
    title: "Fiscal Simulations",
    boardRole: "Finance",
  },
  "Marketing Agent": {
    initials: "MKT",
    accent: "#ddb7ff",
    symbol: "campaign",
    label: "NARRATIVE_SPIRE",
    title: "Demand Shaping",
    boardRole: "Marketing",
  },
  "Pricing Agent": {
    initials: "PRC",
    accent: "#ffdb3c",
    symbol: "sell",
    label: "PRICE_ENGINE",
    title: "Value Architecture",
    boardRole: "Pricing",
  },
  "Supply Chain Agent": {
    initials: "OPS",
    accent: "#7be7d4",
    symbol: "local_shipping",
    label: "SUPPLY_GRID",
    title: "Fulfillment Mesh",
    boardRole: "Supply Chain",
  },
  "Hiring Agent": {
    initials: "HIR",
    accent: "#f7a6c6",
    symbol: "groups",
    label: "TALENT_MESH",
    title: "Capacity Planning",
    boardRole: "Hiring",
  },
  "Risk Agent": {
    initials: "RSK",
    accent: "#ff8f8f",
    symbol: "security",
    label: "RISK_SHIELD",
    title: "Threat Modeling",
    boardRole: "Risk",
  },
  "Sales Strategy Agent": {
    initials: "SLS",
    accent: "#ffb870",
    symbol: "handshake",
    label: "REVENUE_VECTOR",
    title: "Close Strategy",
    boardRole: "Sales Strategy",
  },
};

export const sampleProblem = `We are a seed-stage AI workflow startup considering expansion into the mid-market healthcare operations segment. The product automates prior-authorization workflows for hospitals and clinics, but expansion requires deeper integrations, a longer enterprise sales cycle, stronger compliance controls, and a specialized customer success layer. We have 11 months of runway, modeled gross margin of 68%, expected CAC payback of 15 months, and pricing around $28,000 ACV. The board needs to decide whether to launch now, modify the approach, or pause.`;

export const defaultTimeline = [
  { round: 1, synopsis: "Initiation - each executive sets an opening position." },
  { round: 2, synopsis: "Challenge - assumptions are pressure-tested across functions." },
  { round: 3, synopsis: "Directive - the board converges on conditions and action." },
];
