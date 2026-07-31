# WealthOS backend

A small Flask API that stores your WealthOS data (transactions, budgets, goals,
investments, net worth, tax profile) and powers three Claude-driven agents: an
advisor, an expense tracker, and a tax auditor.

## Run it locally

```
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and add your Anthropic API key (get one at
https://console.anthropic.com/settings/keys). The core app (dashboard, budget,
goals, investments) works fine without a key — only the three agent endpoints
need it, and they fail with a clear error message rather than crashing if it's
missing.

```
python run.py
```

Starts on `http://0.0.0.0:5050`. Health check: `curl http://localhost:5050/api/health`.

### Testing from your phone on the same Wi-Fi

Find your computer's LAN IP:
- Mac: `ipconfig getifaddr en0`
- Windows: `ipconfig` (look for IPv4 Address)
- Linux: `hostname -I`

Put `http://<that-ip>:5050` into `src/config.js` in the WealthOS app. Your phone
and computer need to be on the same network. This is the fastest way to test
real sync while developing, but it stops working the moment you leave that Wi-Fi.

## Database migrations

Schema changes (new columns, new tables) are managed with Alembic via Flask-Migrate,
not automatic table creation — this avoids the failure mode where a new field
silently breaks every request because the live database was never told about it.

**When you add/change a model field:**
```
export FLASK_APP=run.py
flask db migrate -m "short description of the change"
flask db upgrade
```
The first command generates a migration file in `migrations/versions/` by diffing
your models against the current database — review it before running upgrade,
since autogenerate isn't perfect (it won't detect some column renames, for example).
The second actually applies it to whatever database `DATABASE_URL` (or the local
SQLite default) currently points to.

**Commit the generated migration file** along with your model changes — it needs
to travel with the code, the same as any other source file.

**On Render**, after pushing a change that includes a new migration, run the
upgrade against production once via the **Shell** tab (left sidebar on your
service):
```
flask db upgrade
```
This applies pending migrations to whatever `DATABASE_URL` is set to in that
environment (Neon, or wherever your production database lives) without a full
redeploy. Do this once per new migration, not on every deploy.

## Deploy it for real (Render.com, free tier)

This gets you a permanent `https://` URL that works from anywhere, not just your
home Wi-Fi — what you actually want for "sync across devices."

1. Push this `wealthos-backend` folder to a GitHub repo (can be private).
2. Go to render.com, sign up, click **New > Web Service**, connect the repo.
3. Settings:
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `gunicorn run:app --timeout 120`
     (the default 30s Gunicorn worker timeout is too short for the Advisor's
     more detailed, multi-tool-call responses — without this flag, long
     requests get killed mid-flight and show up in the browser as a
     misleading "CORS blocked" error, even though CORS isn't the real issue)
   - **Instance type:** Free
4. Add environment variables:
   - `JWT_SECRET_KEY` — any long random string (signs your login tokens)
   - `ANTHROPIC_API_KEY` — your Claude API key, if you want the agents live in production
5. Deploy. Render gives you a URL like `https://wealthos-backend.onrender.com`.
6. Put that URL into `src/config.js` in the WealthOS app (the `API_BASE_URL`
   constant), rebuild/reload the app, and you're syncing from anywhere.

Notes on the free tier: the service sleeps after 15 minutes of inactivity and
takes ~30-60 seconds to wake up on the next request — fine for a personal app,
just expect the first load after idle time to be slow. SQLite on Render's free
tier lives on ephemeral disk, so a redeploy can wipe the database — for anything
beyond casual personal use, swap in Render's free Postgres addon (change
`DATABASE_URL` to the Postgres connection string Render gives you; no code
changes needed since SQLAlchemy handles both).

## The three agents

All three are genuine tool-use loops against Claude — the model decides when to
call its tool, the backend executes it against the real database, and the model
narrates over the result. Any arithmetic that matters (tax liability, totals) is
always computed deterministically in Python; the model never does the math
itself, only reasons over numbers it's handed.

- **Advisor** (`POST /api/agents/advisor`, `{"message": "..."}`) — has a
  `get_financial_snapshot` tool (net worth, budget, savings rate, goals, health
  score). Ask it anything about your finances.
- **Tracker** (`POST /api/agents/tracker`, `{"text": "..."}`) — has a
  `create_transaction` tool. Feed it plain language like `"swiggy 450 for
  lunch"` and it extracts type/amount/category and logs it. Asks a clarifying
  question instead of guessing if the text is too ambiguous.
- **Auditor** (`POST /api/agents/auditor`, `{"message": "..."}` optional) — has
  a `get_tax_computation` tool that runs the full old-vs-new regime comparison
  (`app/tax_engine.py`) plus TDS/advance-tax reconciliation, then narrates the
  findings. `GET /api/tax/compute` exposes the same computation directly with
  no LLM call, for instant numbers in the UI — the agent endpoint adds the
  narrative on top of those same numbers.

**Tax engine scope** (see the docstring in `app/tax_engine.py` for the full
list): covers the common salaried-individual case for FY 2026-27 — both
regimes' slabs, standard deduction, 80C/80D/HRA/home-loan-interest/NPS
deductions under the old regime, 80CCD(2) employer NPS under the new regime,
Section 87A rebate with marginal relief, surcharge, and cess. It does **not**
model capital gains (which have separate special rates), senior-citizen slabs,
or every edge case of a full ITR filing — treat it as a strong estimate, not a
replacement for a CA at filing time.

## API summary

All endpoints except auth require `Authorization: Bearer <token>`.

**Core**
- `POST /api/auth/register` `{email, password, name}` → `{token, user}` — creates account, seeds starter data
- `POST /api/auth/login` `{email, password}` → `{token, user}`
- `GET /api/state` → full account state (profile, assets, liabilities, transactions, budgets, goals, investments, sipLog)
- `POST /api/transactions` `{type, amount, category, note}`
- `DELETE /api/transactions/<id>`
- `PUT /api/budgets/<id>` `{limit}`
- `POST /api/goals` `{name, target, current, color}`
- `PUT /api/goals/<id>` `{name?, target?, current?, color?}`
- `PUT /api/profile` `{name?, monthlyIncome?, monthlyBudget?}`
- `POST /api/sip` `{paid, monthKey}`

**Tax**
- `GET /api/tax/state` → income sources, tax profile, advance tax payments
- `POST /api/tax/income-sources` `{name, category, annualAmount, tdsDeducted}`
- `PUT /api/tax/income-sources/<id>`, `DELETE /api/tax/income-sources/<id>`
- `PUT /api/tax/profile` `{regime, basicSalary, deductions: {...}}`
- `POST /api/tax/advance-payments` `{quarter, amount}`
- `DELETE /api/tax/advance-payments/<id>`
- `GET /api/tax/compute` → deterministic regime comparison + TDS reconciliation, no LLM call

**Agents** (require `ANTHROPIC_API_KEY`)
- `POST /api/agents/advisor` `{message}` → `{reply}`
- `POST /api/agents/tracker` `{text}` → `{reply}` (also creates a transaction as a side effect if the model calls its tool)
- `POST /api/agents/auditor` `{message?}` → `{reply}`

## Security note

This is a personal-use backend: one password hash per user, JWT auth, CORS open.
It has not been hardened for public multi-tenant use (no rate limiting, no email
verification, no password reset flow). Fine for you and your family; don't put
it in front of the public internet as a product without adding those. Also keep
your `ANTHROPIC_API_KEY` out of git — `.gitignore` already excludes `.env`.

