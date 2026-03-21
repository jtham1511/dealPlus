/**
 * api/scenario.js — Scenario Planner AI Analysis
 *
 * Receives the user's configured scenario vs the original data
 * and returns a structured AI assessment.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadData() {
  const dataPath = path.join(__dirname, "..", "public", "data", "gartner_data.json");
  try {
    return JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  } catch (err) {
    console.error("[scenario.js] Failed to load data:", err.message);
    return null;
  }
}

function getPricingMap(d) {
  const map = {};
  d.pricing.forEach(p => { map[p.accountType] = p.newCostPerUser; });
  // New tiers not in original pricing
  map["CISO-Member (NEW)"] = 77233;
  map["I&Op (NEW)"] = 117000;
  return map;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { scenario, changes, scenarioCost, originalCost } = req.body;
  if (!scenario) return res.status(400).json({ error: "scenario payload required" });

  const d = loadData();
  if (!d) return res.status(500).json({ error: "Data file not found. Run excel_to_json.py first." });

  const pricingMap = getPricingMap(d);

  // Build detailed change analysis
  const changeDetails = (changes || []).map(c => {
    const orig = d.users.find(u => u.id === c.userId);
    if (!orig) return null;
    const parts = [];
    if (c.statusChanged) parts.push(`decision changed: ${c.origStatus} → ${c.newStatus}`);
    if (c.accountChanged) parts.push(`account changed: ${c.origAccount} → ${c.newAccount}`);
    return `${c.userId} (${orig.accountType}, survey: ${orig.surveyStatus}, value: ${orig.valueAssessment}, ` +
           `activity: ${orig.activityLevel}/${orig.totalActivities} acts): ${parts.join('; ')}`;
  }).filter(Boolean);

  // Build original status counts for reference
  const origCounts = {};
  d.users.forEach(u => { origCounts[u.status] = (origCounts[u.status] || 0) + 1; });

  const system = `You are an expert Gartner contract renewal analyst. You assess renewal scenario configurations against the original AI recommendation matrix and provide structured, actionable feedback.

ORIGINAL DATA CONTEXT:
- ${d.contract.totalLicensedUsers} licensed users, ${d._meta.analysisPeriod}
- Contract expiry: ${d._meta.contractExpiry}
- Original annual cost (all accounts): $${d.contract.newAnnualCost.toLocaleString()}
- Original recommendation baseline: ${JSON.stringify(origCounts)}
- Survey: ${d.contract.responded} respondents, ${d.survey.substantialValuePct}% substantial value, ${d.survey.exitIntentionPct}% exit intention

KEY RULES FOR ASSESSMENT:
1. Users with Substantial value + active/high activity should generally be RENEWED
2. Users with Limited value + low activity + no survey are termination candidates
3. Non-respondents with active usage need follow-up BEFORE termination (not immediate terminate)
4. Terminating an EPL-Leader affects 3 attached extended member seats
5. GTP-SMB sold in lots of 25 — cost only reduces if headcount drops below 25
6. CISO-Member ($77,233/yr) is good for GTP-SMB users needing Magic Quadrant access
7. Right-sizing to lower tier = Review status, not Terminate

RESPONSE FORMAT:
Start with a one-line verdict tag: [VERDICT: Better|Optimised|Needs Review|Caution]
Then provide:
- **Overall Assessment** (2-3 sentences)
- **✅ Good Decisions** (list what the user got right, with specific user IDs)
- **⚠️ Flagged Issues** (decisions that contradict the data, with reasons)
- **💰 Cost Impact** (breakdown of savings/costs and whether justified)
- **💡 Suggestions** (2-3 specific improvements they could make)
- **Conclusion** (one line on whether to proceed)

Be direct, specific, reference user IDs, keep it under 400 words.`;

  const userMessage = `Please analyse this renewal scenario:

SCENARIO STATUS: ${JSON.stringify(scenario)}
SCENARIO ANNUAL COST: $${Math.round(scenarioCost || 0).toLocaleString()}
ORIGINAL BASELINE COST: $${Math.round(originalCost || d.contract.newAnnualCost).toLocaleString()}
DELTA: ${(scenarioCost - originalCost) <= 0 ? 'Saving' : 'Extra cost'} $${Math.round(Math.abs((scenarioCost||0) - (originalCost||0))).toLocaleString()}

CHANGES FROM ORIGINAL (${changeDetails.length} users modified):
${changeDetails.length === 0 ? 'No changes from original recommendations.' : changeDetails.join('\n')}

Assess this scenario.`;

  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();

  try {
    let reply;

    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
      const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 1200, system, messages: [{ role: "user", content: userMessage }] }),
      });
      if (!response.ok) { const e = await response.json(); throw new Error(e.error?.message || `Anthropic error ${response.status}`); }
      const data = await response.json();
      reply = data.content?.[0]?.text || "No response.";

    } else if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
      const model = process.env.OPENAI_MODEL || "gpt-4o";

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, max_tokens: 1200,
          messages: [{ role: "system", content: system }, { role: "user", content: userMessage }] }),
      });
      if (!response.ok) { const e = await response.json(); throw new Error(e.error?.message || `OpenAI error ${response.status}`); }
      const data = await response.json();
      reply = data.choices?.[0]?.message?.content || "No response.";
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error("[scenario.js]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
