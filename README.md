# budget-tracker

[![tests](https://github.com/dguywhoknows/budget-tracker/actions/workflows/tests.yml/badge.svg)](https://github.com/dguywhoknows/budget-tracker/actions/workflows/tests.yml)

Drop in a bank CSV to auto-categorize spending, catch subscriptions and anomalies, and get AI budgeting insights, all privately in your browser.

Live: https://dguywhoknows.github.io/budget-tracker/

## Overview

Budget Brain imports CSV exports from almost any bank by auto-detecting date formats, debit/credit vs signed amount columns, and sign conventions. It normalizes messy merchant strings ("SQ *BLUE DOOR CAFE #1234 TORONTO ON" → "BLUE DOOR CAFE") and categorizes them with a rules engine plus your own overrides. AI handles the leftovers. It then finds recurring subscriptions (including price hikes), flags anomalies with robust statistics, and visualizes everything. The AI coach only ever sees aggregated totals.

## Pages

- **Dashboard**
- **Transactions**
- **Budgets**
- **Goals**
- **Rules**
- **Reports**
- **Settings**

## Features

- Bank-agnostic CSV import: header detection, date-format inference, debit/credit merging, sign normalization
- Merchant normalization + regex rules + per-merchant overrides that persist
- AI batch categorization of unknown merchants
- Recurring detection: interval analysis (weekly/biweekly/monthly/yearly), amount stability, price-change alerts
- Anomaly detection: median/MAD robust z-scores, duplicate charges, large first-time merchants
- Stacked monthly bars, category donut, editable budgets with progress bars
- Privacy-first AI coach that receives only aggregates
- Transactions page: search and filter by month, category and categorization source; per-transaction notes; exclude from totals; manual entries; CSV export
- Category changes can apply to one transaction or become a merchant-wide rule
- Budgets page: per-category monthly budgets with optional rollover of unspent amounts and a 6-month history sparkline per category
- Goals page: savings goals with progress rings, ETA projected from your actual average monthly savings, and deadline on-track checks
- Rules page: ordered user rules (contains / equals / regex on merchant or description, optional amount range) with live match counts and a rule tester
- Reports page: income vs spending cash-flow chart, 3-month forecast with fixed costs, category trend table

## How it works

LLM calls are used for:

- JSON-mode merchant → category classification for anything the rules miss
- Budget coach that turns aggregated stats into insights and actions (budgeting only, no investment advice)

Everything else (parsing, normalization, rules, recurring/anomaly detection, charts, budgets) runs locally in the browser.

## Getting started

No build step and no dependencies. Serve the folder with any static server:

```bash
git clone https://github.com/dguywhoknows/budget-tracker.git
cd budget-tracker
python -m http.server 8000
```

Then open http://localhost:8000.

`index.html` is the public home page, `login.html` handles accounts and `app.html` is the app.

### Telling the app what to do

Every page has an **Ask AI** box (Ctrl/Cmd+K). Type a request in plain words and the model plans a sequence of
calls to the app's own functions, runs them and reports back. The **Instructions** tab stores standing
preferences that are added to every AI request the app makes.

### Configuration

`src/lib/config.js` is generated from the build settings: the Supabase project (accounts) and the AI proxy URL.
Signed-in users get the built-in AI through the proxy, which keeps the provider key as a server-side secret.
Without those settings the app runs for guests, in demo mode, or with a personal [Groq](https://console.groq.com/keys)
or [OpenRouter](https://openrouter.ai/keys) key entered under **Settings → Model provider** (stored only in this
browser and sent only to that provider).

## Testing

`src/core.js` holds the app's logic as pure functions and is covered by 15 unit tests.

```bash
node tests/run-node.js        # CI runs this on every push
```

Or open `tests/index.html` in a browser ([live](https://dguywhoknows.github.io/budget-tracker/tests/)).

## Project structure

```
index.html           public home page (generated)
login.html           sign-in and sign-up (generated)
app.html             the app: markup for every page
src/app.js           UI, page wiring and event handlers
src/core.js          pure logic with no DOM access (unit-tested)
src/demo.js          sample responses used when no API key is configured
src/lib/ai.js        LLM client: Groq / OpenRouter, streaming, JSON mode, retries
src/lib/dom.js       DOM helpers, namespaced storage, markdown renderer
src/lib/router.js    hash router and the Settings page
src/lib/copilot.js   AI command box that drives the app's own functions
src/lib/auth.js      accounts (Supabase Auth) and the sign-in gate
styles/base.css      design tokens and shared components
styles/app.css       app-specific styles
tests/               unit tests (browser runner + Node runner for CI)
```

## Tech

- Robust statistics (median absolute deviation)
- Hand-built SVG stacked bar + donut charts
- Seeded synthetic bank data generator
- Parsing, categorization priority, recurring/anomaly detection, budgets with rollover, goal projections and forecasting in src/core.js with unit tests
- Vanilla JavaScript, no framework or bundler
- Deployed with GitHub Pages

## License

MIT
