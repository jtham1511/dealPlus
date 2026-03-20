/**
 * Gartner Renewal Portal — AI Chat API Route
 * Vercel Serverless Function
 *
 * Supports: Anthropic (Claude) and OpenAI (GPT-4o)
 * Provider is selected via AI_PROVIDER env var: "anthropic" | "openai"
 */

const SYSTEM_PROMPT = `You are an intelligent AI assistant embedded in the Gartner Contract Renewal Intelligence Portal for GovTech/SNG. You help renewal decision-makers understand usage data, survey insights, and budget impacts to prepare for contract negotiations.

CONTRACT OVERVIEW:
- Analysis Period: Aug 2023 – Oct 2025 (26 months) | Expiry: July 2026
- Licensed Users: 39 (17 responded, 20 non-respondents, 2 excluded)
- Projected Spend: $3.81M of $3.92M approved (96.7% utilised)
- New Contract Price Increase: +26.1% average ($1.34M → $1.68M/yr annual)
- Total new annual cost: $1,689,816/yr vs $1,340,753/yr current

USAGE STATISTICS:
- Total Interactions: 8,022 (26-month cumulative)
- Downloads: 7,569 (94.4%) | Analyst Calls: 396 (4.9%, 15/month avg) | Conferences: 63 (0.8%)
- Monthly average all users: 309 | Cost per interaction: ~$475
- GT agency: 37 users, 7,510 activities (93.5%) | SNG: 2 users, 518 activities (6.5%)

USER ACTIVITY LEVELS:
- Extreme Outlier (>1,000 acts): User9/CISO — 2,050 acts, 78.8/month
- High (600-999): User5/CIO-697, User11/GITL-Advisor-648, User12/GITL-Advisor-762
- Active (100-599): 10 users | Low (<100 acts): 25 users (64% of all licensed seats)

ACCOUNT TYPE PRICING (Current → New per user/yr):
- EPL-Leader: $175,933 → $229,133 (+30.2%) — 2 users
- EPL-Advisor: $68,700 → $105,100 (+53.0%) — 3 users [HIGHEST INCREASE — key negotiation lever]
- CIO Self-directed: $128,750 → $149,133 (+15.8%) — 1 user (User5)
- CDAO: $100,500 → $117,000 (+16.4%) — 2 users
- CISO: $100,500 → $117,000 (+16.4%) — 1 user (User9, extreme outlier)
- GITL-Advisor: $61,733 → $72,033 (+16.7%) — 3 users
- GITL-Reference: $34,667 → $41,000 (+18.3%) — 1 user
- GTP-SMB: $5,103 → $6,116 (+19.9%) — 25 users [sold in lots of 25, min = 1 lot]
- NEW: CISO-Member: $77,233/yr (mid-tier between GTP-SMB and full CISO)
- NEW: Infrastructure & Operations (I&Op): $117,000/yr

INDIVIDUAL USER RECOMMENDATIONS:
Renew (10 users): User4 EPL-Advisor/engagement coaching, User5 CIO/usage optimisation, User9 CISO/maintain tier (extreme outlier — most critical), User11 GITL-Advisor/maintain, User12 GITL-Advisor/maintain, User14 GTP-SMB/engagement, User18 GTP-SMB/investigate barriers, User26 GTP-SMB/investigate barriers, User29 GTP-SMB/engagement, User33 GTP-SMB/engagement
Review/Right-size (2 users): User10 GITL-Advisor/wants data-specific tier, User32 GTP-SMB/needs MQ access unavailable in current tier
Terminate (5 users): User13 GITL-Reference (do not need), User19 GTP-SMB (no impact/technical role), User27 GTP-SMB (significant downgrade — no MQ), User30 GTP-SMB (significant downgrade), User31 GTP-SMB (do not need) — estimated savings ~$300,713/yr at new pricing
Follow-up Required (20 users): All non-respondents — priority: User1 EPL-Leader (active 114), User7 CDAO (active 413), User34 GTP-SMB (active 290)
Excluded (2 users): User2 EPL-Leader (left org), User23 GTP-SMB (not using) — saves ~$235,249/yr

SURVEY RESULTS (17 active respondents):
- Q3 Usefulness: Essential 12% (2), Frequently valuable 35% (6), Occasionally helpful 24% (4), Rarely valuable 24% (4), No impact 6% (1)
- High Usefulness total: 47% (8/17)
- Q4 Top impact areas: Strategic planning 71%, Risk mitigation 71%, Innovation roadmap 41%, Vendor selection 29%, Competitive intelligence 24%
- Broad applications (2+ areas selected): 71% (12/17)
- Q14 Value vs Cost: Exceeds 59% (10/17), Less than cost 41% (7/17)
- Q15 Future: Continue 59% (10/17), Change tier 24% (4/17), Do not need 18% (3/17)
- VEV Substantial Value: 53% (9/17)

KEY USER FEEDBACK:
- User10: AI tools (ChatGPT, Claude, Gemini) are Gartner's biggest competitor; human analyst still better for unique problems
- User27, User30, User32: Magic Quadrant not available in their tier — significant friction driving exit intent
- User18, User33: Single-user download restriction is a barrier; request multi-user licensing
- User5: Difficult to justify $149k/yr given personal availability constraints
- User9 (CISO): Exceptional engagement — M365, security tooling, LLM playbook, quantum safe programme
- User33: Requests publication dates in filenames for better document management

LICENSING RULES:
- EPL-Leader requires 3 extended member seats (EPL-Advisor or CIO attached)
- Currently 4 of 6 extended slots filled — 2 UNUSED SLOTS (structural gap)
- CIO Self-directed and EPL-Advisor cannot be procured standalone
- GTP-SMB: minimum purchase = 1 lot of 25 seats; currently exactly 25 (1 lot)
- Removing GTP-SMB seats only saves money if headcount drops below 25
- Terminating an EPL-Leader must account for all 3 attached extended member seats

TOP NEGOTIATION POINTS:
1. Challenge EPL-Advisor +53% increase — highest of all account types, hardest to justify
2. 64% of users have low activity — use this to negotiate volume/seat reduction at EPL tiers
3. 2 unused EPL extended member slots = structural gap Gartner hasn't addressed — use as leverage
4. Magic Quadrant access friction is actively driving exit intent — request MQ inclusion in GTP-SMB or CISO-Member upgrade
5. Single-user download restriction impacts multiple users — request multi-user/team licensing
6. 20 non-respondents (51% of seats) have no survey data — negotiate provisional renewal with exit clause

Portal sections the user can navigate to: [Executive Summary], [Usage Analysis], [User Matrix], [Budget & Pricing], [Survey Intelligence], [Recommendations]

When users reference navigation, mention the section name in square brackets like [Budget & Pricing] or [User Matrix]. Keep responses concise, analytical, and actionable for contract renewal preparation.`;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // CORS headers (adjust origin in production)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request: messages array required" });
  }

  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();

  try {
    let reply;

    // ─────────────────────────────────────────
    // ANTHROPIC — Claude
    // ─────────────────────────────────────────
    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

      const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `Anthropic API error ${response.status}`);
      }

      const data = await response.json();
      reply = data.content?.[0]?.text || "No response received.";
    }

    // ─────────────────────────────────────────
    // OPENAI — GPT-4o
    // ─────────────────────────────────────────
    else if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

      const model = process.env.OPENAI_MODEL || "gpt-4o";

      // Convert Anthropic message format to OpenAI format
      const openaiMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: openaiMessages,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `OpenAI API error ${response.status}`);
      }

      const data = await response.json();
      reply = data.choices?.[0]?.message?.content || "No response received.";
    }

    else {
      throw new Error(`Unknown AI_PROVIDER: "${provider}". Use "anthropic" or "openai".`);
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error("[chat.js] Error:", err.message);
    return res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
}
