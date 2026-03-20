# 🏛️ Gartner Contract Renewal Intelligence Portal
### Deployment & Configuration Guide

---

## Project Structure

```
gartner-renewal-portal/
├── api/
│   └── chat.js          ← AI serverless function (Anthropic or OpenAI)
├── public/
│   └── index.html       ← The portal (all HTML/CSS/JS in one file)
├── .env.example         ← Environment variable template
├── .gitignore           ← Prevents API keys from being committed
├── package.json
├── vercel.json          ← Vercel routing & function config
└── README.md            ← This file
```

**How it works:** The portal's AI chat button sends messages to `/api/chat` (your
Vercel serverless function). That function reads your API key from environment
variables and forwards the request to Anthropic or OpenAI — your key is **never**
exposed to the browser.

---

## STEP 1 — Prerequisites

Install Node.js (v18+) and the Vercel CLI:

```bash
# Check Node version (must be 18+)
node --version

# Install Vercel CLI globally
npm install -g vercel

# Verify installation
vercel --version
```

---

## STEP 2 — Get Your API Key

### Option A: Anthropic (Claude Sonnet 4.6) ← Recommended

1. Go to **https://console.anthropic.com/**
2. Sign in or create an account
3. Click **API Keys** in the left sidebar
4. Click **Create Key** → give it a name like `gartner-portal`
5. Copy the key — it starts with `sk-ant-api03-...`
   > ⚠️ **You only see it once.** Save it somewhere safe immediately.
6. Ensure your account has credits: **https://console.anthropic.com/settings/billing**

### Option B: OpenAI (GPT-4o)

1. Go to **https://platform.openai.com/api-keys**
2. Click **Create new secret key** → name it `gartner-portal`
3. Copy the key — it starts with `sk-proj-...`
   > ⚠️ **You only see it once.** Save it somewhere safe immediately.
4. Ensure your account has credits: **https://platform.openai.com/settings/billing**

---

## STEP 3 — Local Test (Optional but Recommended)

Test locally before deploying to Vercel:

```bash
# 1. Navigate into the project folder
cd gartner-renewal-portal

# 2. Create your local environment file
cp .env.example .env.local

# 3. Edit .env.local and add your real API key:
#    AI_PROVIDER=anthropic
#    ANTHROPIC_API_KEY=sk-ant-api03-YOUR-REAL-KEY-HERE
#    ANTHROPIC_MODEL=claude-sonnet-4-6

# 4. Start the local dev server (requires Vercel CLI)
vercel dev

# 5. Open http://localhost:3000 in your browser
#    Click the chat button bottom-right and test a question
```

---

## STEP 4 — Deploy to Vercel

### Method A: Deploy via CLI (Fastest)

```bash
# 1. Inside the project folder, log in to Vercel
vercel login
# → Follow the browser prompt to authenticate

# 2. Deploy (first time — Vercel will ask setup questions)
vercel

# When prompted:
#   Set up and deploy? → Y
#   Which scope? → Select your account
#   Link to existing project? → N (first time)
#   Project name → gartner-renewal-portal (or press Enter)
#   In which directory is your code? → ./ (press Enter)
#   Want to override settings? → N

# 3. Deploy to production
vercel --prod
# → You'll get a URL like: https://gartner-renewal-portal.vercel.app
```

### Method B: Deploy via GitHub (Best for Teams)

```bash
# 1. Create a GitHub repo (via GitHub website or CLI)
git init
git add .
git commit -m "Initial commit — Gartner Renewal Portal"
git remote add origin https://github.com/YOUR-USERNAME/gartner-renewal-portal.git
git push -u origin main

# 2. Go to https://vercel.com/new
# 3. Click "Import Git Repository"
# 4. Select your GitHub repo
# 5. Click "Deploy" (configure env vars in next step before it goes live)
```

---

## STEP 5 — Configure Environment Variables in Vercel

**This is the most important step — without this the AI bot won't work.**

### Via Vercel Dashboard (Recommended)

1. Go to **https://vercel.com/dashboard**
2. Click on your **gartner-renewal-portal** project
3. Click **Settings** (top tab)
4. Click **Environment Variables** (left sidebar)
5. Add each variable:

| Variable Name | Value | Environment |
|---|---|---|
| `AI_PROVIDER` | `anthropic` | Production, Preview, Development |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Production, Preview, Development |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Production, Preview, Development |

   > For OpenAI instead: set `AI_PROVIDER=openai`, add `OPENAI_API_KEY` and `OPENAI_MODEL=gpt-4o`

6. Click **Save** for each variable
7. **Redeploy** the project: Go to **Deployments** tab → click the three-dot menu on your latest deployment → **Redeploy**

### Via CLI (Alternative)

```bash
# Add environment variables via CLI
vercel env add AI_PROVIDER
# → Type: anthropic, select: Production + Preview + Development

vercel env add ANTHROPIC_API_KEY
# → Paste your key, select: Production + Preview + Development

vercel env add ANTHROPIC_MODEL
# → Type: claude-sonnet-4-6, select: Production + Preview + Development

# Then redeploy to apply
vercel --prod
```

---

## STEP 6 — Verify Deployment

1. Open your Vercel URL (e.g. `https://gartner-renewal-portal.vercel.app`)
2. Click the **chat bubble** in the bottom-right corner
3. Type: `What is the total price increase for the new contract?`
4. You should receive a detailed answer within 3–5 seconds

**If the bot doesn't respond:**
- Check **Vercel Dashboard → Functions** tab for error logs
- Verify environment variables are set and the project was redeployed after adding them
- Check the browser console (F12) for network errors on `/api/chat`

---

## Model Options Reference

### Anthropic Models (set `AI_PROVIDER=anthropic`)

| `ANTHROPIC_MODEL` | Description | Best For |
|---|---|---|
| `claude-sonnet-4-6` | **Recommended** — Smart, fast, cost-efficient | General portal use |
| `claude-opus-4-6` | Most intelligent, slower, higher cost | Complex analysis |
| `claude-haiku-4-5-20251001` | Fastest, lowest cost | High-volume usage |

### OpenAI Models (set `AI_PROVIDER=openai`)

| `OPENAI_MODEL` | Description | Best For |
|---|---|---|
| `gpt-4o` | **Recommended** — Best quality | General portal use |
| `gpt-4o-mini` | Fast and cheap | High-volume usage |
| `gpt-4-turbo` | High quality, legacy | Fallback option |

---

## Switching AI Providers

You can switch between Anthropic and OpenAI at any time **without changing any code**:

**Switch to OpenAI:**
1. Go to Vercel → Settings → Environment Variables
2. Change `AI_PROVIDER` from `anthropic` to `openai`
3. Add `OPENAI_API_KEY` with your OpenAI key
4. Optionally set `OPENAI_MODEL=gpt-4o`
5. Redeploy

**Switch back to Anthropic:**
1. Change `AI_PROVIDER` back to `anthropic`
2. Redeploy

---

## Troubleshooting

### "API key not configured" error
→ Environment variable not set. Go to Vercel → Settings → Environment Variables and add `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, then redeploy.

### "Model not found" error
→ Invalid model name. Check the Model Options table above for exact model strings.

### Chat bot doesn't appear / no response
→ Open browser DevTools (F12) → Network tab → look for a failed `/api/chat` request. Check the response body for the error message.

### Works locally but not on Vercel
→ Environment variables set in `.env.local` are NOT automatically synced to Vercel. You must add them manually in the Vercel dashboard.

### "Function timeout" error
→ The serverless function has a 30-second timeout (set in vercel.json). If you hit this consistently, switch to `claude-haiku-4-5-20251001` or `gpt-4o-mini` for faster responses.

---

## Security Notes

- ✅ API keys are stored as Vercel environment variables (encrypted at rest)
- ✅ API keys are **never** sent to the browser
- ✅ All AI requests are proxied through your serverless function
- ✅ `.gitignore` prevents `.env.local` from being committed
- ⚠️ Consider restricting CORS in `api/chat.js` for production (change `*` to your specific domain)

---

## Cost Estimates

With `claude-sonnet-4-6` at typical portal usage (50 questions/day):
- Input tokens per question: ~2,000 (system prompt) + ~200 (conversation)
- Output tokens per question: ~300
- Estimated daily cost: **~$0.50–$1.50/day**

For lower cost, use `claude-haiku-4-5-20251001` (approx 10× cheaper than Sonnet).

---

*Gartner Contract Renewal Intelligence Portal · GovTech/SNG · Analysis: Aug 2023–Oct 2025*
