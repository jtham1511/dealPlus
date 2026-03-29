/**
 * api/chat.js — Gartner Renewal Portal AI Chat
 *
 * Reads data/gartner_data.json at request time and builds the
 * AI system prompt dynamically — so every AI response automatically
 * reflects the latest data without any code changes.
 *
 * Provider: "anthropic" or "openai" via AI_PROVIDER env var
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load data ─────────────────────────────────────────────────────────────────
function loadData() {
  const dataPath = path.join(__dirname, "..", "public", "data", "gartner_data.json");
  try {
    const raw = fs.readFileSync(dataPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("[chat.js] Failed to load gartner_data.json:", err.message);
    return null;
  }
}

// ── Build system prompt dynamically from data ─────────────────────────────────
function buildSystemPrompt(d) {
  if (!d) {
    return `You are an AI assistant for the Gartner Contract Renewal Portal.
Data is currently unavailable. Advise the user to run the excel_to_json.py 
converter and redeploy.`;
  }

  const { _meta, contract, usage, survey, pricing, statusCounts, agencies, users } = d;

  // Compute derived facts on the fly
  const totalInteractions = usage.totalInteractions;
  const renewUsers   = users.filter(u => u.status === "renew");
  const terminateUsers = users.filter(u => u.status === "terminate");
  const reviewUsers  = users.filter(u => u.status === "review");
  const followupUsers = users.filter(u => u.status === "followup");
  const excludedReassignUsers = users.filter(u => u.status === "excluded-reassign");
  const excludedTerminateUsers = users.filter(u => u.status === "excluded-terminate");
  const excludedUsers = [...excludedReassignUsers, ...excludedTerminateUsers];

  const topUsers = [...users]
    .filter(u => !u.status.startsWith("excluded"))
    .sort((a, b) => b.totalActivities - a.totalActivities)
    .slice(0, 5)
    .map(u => `${u.id} (${u.accountType}): ${u.totalActivities} acts, ${u.monthlyAvg}/mo — ${u.status}`)
    .join("\n    ");

  const pricingLines = pricing
    .map(p => `  ${p.accountType}: $${p.currentCostPerUser.toLocaleString()} → $${p.newCostPerUser.toLocaleString()} (+${p.increasePct}%) — ${p.userCount} users`)
    .join("\n");

  const agencyLines = agencies
    .map(ag => `  ${ag.agency}: ${ag.users} users, ${ag.total} activities (${ag.activitySharePct}% share), ${ag.monthlyAvg}/mo avg`)
    .join("\n");

  const renewList     = renewUsers.map(u => `${u.id} ${u.accountType}`).join(", ");
  const terminateList = terminateUsers.map(u => `${u.id} ${u.accountType} — ${u.decisionRationale}`).join("\n    ");
  const reviewList    = reviewUsers.map(u => `${u.id} ${u.accountType} — ${u.decisionRationale}`).join(", ");
  const followupHighPriority = followupUsers
    .filter(u => u.activityLevel === "Active" || u.activityLevel === "High" || u.activityLevel === "Extreme Outlier")
    .map(u => `${u.id} (${u.accountType}, ${u.totalActivities} acts)`)
    .join(", ");

  const actLevels = usage.activityLevelCounts;

  return `You are an intelligent AI assistant embedded in the Gartner Contract Renewal Intelligence Portal for ${_meta.organization}.
You help renewal decision-makers understand usage data, survey insights, and budget impacts to negotiate the upcoming contract renewal.

DATA FRESHNESS: This data was generated from "${_meta.generatedFrom}" at ${_meta.generatedAt}.
Analysis period: ${_meta.analysisPeriod} (${_meta.analysisPeriodMonths} months) | Contract expires: ${_meta.contractExpiry}

━━━ CONTRACT OVERVIEW ━━━
Total licensed users:     ${contract.totalLicensedUsers}
  Responded to survey:    ${contract.responded}
  Non-respondents:        ${contract.nonRespondents}
  Excluded (reassign pending): ${excludedReassignUsers.length} — seat renews, person changes
  Excluded (seat terminated):  ${excludedTerminateUsers.length} — seat dropped from contract
Budget approved:          $${contract.totalBudgetApproved.toLocaleString()}
Projected final spend:    $${contract.projectedFinalSpend.toLocaleString()} (${contract.budgetUtilisationPct}% utilisation)
Current annual cost:      $${contract.currentAnnualCost.toLocaleString()}/yr
NEW annual cost:          $${contract.newAnnualCost.toLocaleString()}/yr
Average price increase:   +${contract.avgPriceIncreasePct}%
Total increase amount:    $${contract.totalIncreaseAmt.toLocaleString()}/yr

━━━ USAGE STATISTICS ━━━
Total interactions:       ${totalInteractions.toLocaleString()} (26-month cumulative)
  Downloads:              ${usage.totalDownloads.toLocaleString()} (${usage.downloadsPct}%)
  Analyst calls:          ${usage.totalAnalystCalls} (${usage.callsPct}%)
  Conferences:            ${usage.totalConferences} (${usage.confPct}%)
Monthly average (all):    ${usage.monthlyAvgAllUsers}
Cost per interaction:     ~$${usage.costPerInteraction}
Activity breakdown:
  Extreme Outlier (>1000): ${actLevels.extremeOutlier} users
  High (600-999):          ${actLevels.high} users
  Active (100-599):        ${actLevels.active} users
  Low (<100):              ${actLevels.low} users (${Math.round(actLevels.low/contract.totalLicensedUsers*100)}% of all seats)

Agency breakdown:
${agencyLines}

Top 5 users by activity:
    ${topUsers}

━━━ PRICING (Current → New per user/yr) ━━━
NOTE — Account type renames in new contract:
  CIO          →  CIO Self-directed Leader  (same users, new name)
  GITL-Advisor →  CIO Advisor Member V2     (same users, new name)
${pricingLines}

━━━ RENEWAL RECOMMENDATIONS ━━━
RENEW (${renewUsers.length} users):
    ${renewList}

REVIEW / RIGHT-SIZE (${reviewUsers.length} users):
    ${reviewList}

TERMINATE (${terminateUsers.length} users) — est. savings $${terminateUsers.reduce((s,u)=>s+u.newCostYr,0).toLocaleString()}/yr:
    ${terminateList}

FOLLOW-UP REQUIRED (${followupUsers.length} users — no survey data):
    High priority (active usage): ${followupHighPriority}
    Low priority: ${followupUsers.filter(u=>u.activityLevel==='Low').map(u=>u.id).join(', ')}

EXCLUDED — REASSIGNMENT PENDING (${excludedReassignUsers.length} user):
${excludedReassignUsers.map(u=>`    ${u.id} (${u.accountType}) — SEAT RENEWS, PERSON CHANGES
    Succession chain: ${u.reassignmentChain ? u.reassignmentChain.join(' → ') : 'TBD'}
    Action: ${u.reassignmentNote || ''}
    ⚠ Do NOT drop this seat — brief Gartner AM it is a reassignment at existing tier pricing`).join('\n')}

EXCLUDED — SEAT TERMINATED (${excludedTerminateUsers.length} user):
${excludedTerminateUsers.map(u=>`    ${u.id} (${u.accountType}) — ${u.exclusionReason || u.rationale.substring(0,80)}
    Decision Recommendation: ${u.decisionRecommendation} — Remove from contract`).join('\n')}

⚠ CRITICAL DISTINCTION: excluded-reassign ≠ excluded-terminate.
  User2 seat RENEWS under new occupant. User23 seat DROPS. Never treat them the same.

━━━ SURVEY RESULTS (${survey.totalRespondents} respondents) ━━━
High Usefulness (Q3):     ${survey.highUsefulnessPct}% (Essential + Frequently valuable)
Substantial Value (VEV):  ${survey.substantialValuePct}% (${survey.substantialValueCount}/${survey.totalRespondents})
Value exceeds cost (Q14): ${survey.valueExceedsCostPct}% (${survey.valueExceedsCostCount}/${survey.totalRespondents})
Continue Gartner (Q15):   ${survey.continueGartnerPct}% (${survey.continueGartnerCount}/${survey.totalRespondents})
Exit intention (Q15):     ${survey.exitIntentionPct}% (${survey.exitIntentionCount}/${survey.totalRespondents})

Q3 Usefulness breakdown:
${survey.q3Usefulness.map(q=>`  ${q.label}: ${q.count} (${q.pct}%)`).join('\n')}

Q4 Impact areas:
${survey.q4ImpactAreas.map(q=>`  ${q.label}: ${q.count} (${q.pct}%)`).join('\n')}

━━━ KEY NEGOTIATION POINTS ━━━
1. EPL-Advisor +${pricing.find(p=>p.accountType==='EPL-Advisor')?.increasePct||53}% is the highest increase — challenge this aggressively
2. ${actLevels.low} of ${contract.totalLicensedUsers} users (${Math.round(actLevels.low/contract.totalLicensedUsers*100)}%) have LOW activity — use as leverage for seat reduction
3. ${contract.nonRespondents} users (${Math.round(contract.nonRespondents/contract.totalLicensedUsers*100)}% of seats) have no survey data — negotiate provisional renewal with exit clause
4. 2 unused EPL extended member slots (structural gap) — use as leverage
5. Magic Quadrant access friction driving exit intent — request MQ access in GTP-SMB tier
6. Single-user download restriction flagged by multiple users — request multi-user licensing

━━━ PORTAL NAVIGATION ━━━
Portal sections: [Executive Summary] | [Usage Analysis] | [User Matrix] | [Budget & Pricing] | [Survey Intelligence] | [Recommendations]
When relevant, mention section names in square brackets — they become clickable navigation links.

Be concise, analytical, and actionable. Focus on contract negotiation preparation.`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request: messages array required" });
  }

  // Load data fresh on every request — Vercel caches the module in memory
  // so this is fast after the first cold start
  const data = loadData();
  const systemPrompt = buildSystemPrompt(data);
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();

  try {
    let reply;

    // ─── Anthropic ────────────────────────────────────────────────────────────
    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured in environment variables");

      const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: 1024, system: systemPrompt, messages }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `Anthropic API error ${response.status}`);
      }

      const responseData = await response.json();
      reply = responseData.content?.[0]?.text || "No response received.";
    }

    // ─── OpenAI ───────────────────────────────────────────────────────────────
    else if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY not configured in environment variables");

      const model = process.env.OPENAI_MODEL || "gpt-4o";

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `OpenAI API error ${response.status}`);
      }

      const responseData = await response.json();
      reply = responseData.choices?.[0]?.message?.content || "No response received.";
    }

    else {
      throw new Error(`Unknown AI_PROVIDER "${provider}". Use "anthropic" or "openai".`);
    }

    // Include metadata in response so client can show data freshness
    return res.status(200).json({
      reply,
      _dataMeta: data?._meta || null,
    });

  } catch (err) {
    console.error("[chat.js] Error:", err.message);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
