# SEED·20

Prediction market intelligence system. Scans Polymarket, runs AI-powered analysis (with optional Integral Theory lens), and tracks your predictions.

## Quick Start

### Deploy to Vercel (Recommended)

1. Push this folder to a GitHub repo
2. Go to [vercel.com/new](https://vercel.com/new) → Import the repo
3. Add Environment Variables:
   - `GEMINI_API_KEY` — your Google AI Studio key
   - `OPENAI_API_KEY` — your OpenAI key
4. Deploy → Get your URL (e.g. `seed20.vercel.app`)

### Local Development

```bash
# Install Vercel CLI
npm i -g vercel

# Run locally (serves both static files + API functions)
vercel dev
```

Or for frontend-only testing (no API proxy — scanner won't work):
```bash
python -m http.server 3020
```

## Architecture

```
seed20/
├── index.html          # SPA shell
├── style.css           # Dark theme design system
├── app.js              # All frontend logic
├── api/
│   ├── scan.js         # Polymarket scanner proxy
│   └── research.js     # LLM analysis proxy
├── vercel.json         # Deployment config
├── package.json        # Minimal dependencies
└── integral_theory_lens.md  # Analytical reference
```

## Features

- **Dashboard** — Bankroll tracking, quick scan preview
- **Scanner** — Live Polymarket data, filterable by category
- **Research** — Deep analysis powered by Gemini or GPT-4o
- **Journal** — Log predictions, track accuracy
- **Settings** — API keys, scanner config, data export

## Stack

- Frontend: Vanilla HTML/CSS/JS (no framework)
- Backend: Vercel Serverless Functions (Node.js)
- APIs: Polymarket Gamma API, Google Gemini, OpenAI
- Storage: `localStorage` (per-device, v1)
