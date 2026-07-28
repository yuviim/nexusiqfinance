# WealthOS (web)

The same WealthOS — net worth, safe-to-spend gauge, budgets, investments, goals,
financial health score — as a desktop web app. No Expo, no phone build tooling,
no app store. Runs in any browser and syncs to the same Flask backend as before.

## Run it

Make sure the backend is running first (see `wealthos-backend/README.md` —
`pip install -r requirements.txt && python run.py`). Then:

```
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Sign up with an email
and password — that creates your account on the backend, seeded with sample data.

## Install it as an app (no domain needed yet)

This is a PWA (Progressive Web App) — while `npm run dev` is running, most
browsers show an install icon in the address bar (Chrome: a little monitor-with-
arrow icon; Edge: similar). Click it and it installs like a native app — its own
window, its own dock/taskbar icon, no browser chrome. That works today, locally,
before you've bought any domain.

## Going further: real deployment

Once you're ready to put this on a real domain so it's reachable from anywhere
(including your phone, as an installable PWA there too — no app store needed):

1. `npm run build` — produces a `dist/` folder of static files.
2. Deploy `dist/` to any static host: Vercel, Netlify, Cloudflare Pages, or your
   own domain's hosting. All have free tiers and a `vercel deploy` / drag-and-drop
   workflow — point your domain at whichever you pick.
3. Deploy the backend too (see `wealthos-backend/README.md` for the Render.com
   walkthrough) and update `src/config.js` → `API_BASE_URL` to the backend's
   real `https://` URL before running `npm run build` again.
4. Once both are on real domains, open the site on your phone's browser and use
   "Add to Home Screen" — same PWA install as desktop, and you get a mobile app
   icon without ever touching Expo Go or an app store.

## What's inside

Same feature set as the earlier mobile build: Dashboard (net worth, safe-to-spend
gauge, savings rate, financial health score, insights feed), Transactions, Budget,
Investments, Goals, and a Profile/settings page with logout. Left sidebar
navigation instead of bottom tabs, since this is desktop-first.

Plus two new agent-powered pages (need `ANTHROPIC_API_KEY` set in the backend's
`.env` — see `wealthos-backend/README.md`):

- **Advisor** — a chat with a financial-advisor agent that pulls your current
  net worth/budget/goals before answering, rather than talking in generalities.
- **Tax** — income sources, tax profile, and advance tax payments, with an
  instant old-vs-new regime comparison (computed in Python, no LLM needed for
  the numbers) plus a "Run full audit" button that asks the auditor agent to
  narrate the findings and flag any TDS/advance-tax shortfall.

There's also a "quick add" box at the top of Transactions that hands free text
("swiggy 450 for lunch") to the tracker agent, which extracts the amount/
category and logs it for you.

## Tech

Vite + React · React Router · vite-plugin-pwa for installability · plain CSS with
custom properties (no framework) · talks to the Flask backend in `wealthos-backend/`
over the same JWT REST API as the mobile app did.
