# proto-circle — Instant Attribution & Micropayments Engine

Hackathon prototype that proves the **trust layer** for creator commerce:
transparent attribution plus instant USDC micropayments on Arc Testnet.

> See [`docs/product-brief.md`](docs/product-brief.md) for the full product
> spec. See [`AGENTS.md`](AGENTS.md) for the codebase orientation agents (and
> humans) should read first.

## What it does

1. **Register** influencers with their Arc wallet addresses.
2. **Generate** unique tracking links per influencer (e.g. `/r/abc12345`).
3. **Log** every click with a timestamp, keyed to an anonymous browser cookie.
4. **Resolve** attribution on a qualifying conversion event using a
   recency-weighted policy (or last-click).
5. **Pay out** USDC on Arc Testnet via Circle Developer-Controlled Wallets,
   one transfer per attributed influencer.
6. **Show the evidence** — timeline, rationale, and payout status — in a
   single dashboard.

## Stack

- Next.js 15 (App Router) + TypeScript
- SQLite via `better-sqlite3` (file-based, zero setup)
- Circle Developer-Controlled Wallets SDK on Arc Testnet
- No auth, no background workers — single local process

## Setup

Prereqs: Node 20+, a Circle test API key
([console.circle.com](https://console.circle.com)).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set CIRCLE_API_KEY to your test key

# 3. One-time platform wallet setup
#    Creates an entity secret, a platform payout wallet, funds it from faucet,
#    and appends CIRCLE_ENTITY_SECRET + CIRCLE_WALLET_ADDRESS to .env.
npm run setup
```

During setup the script will pause and ask you to fund the wallet from
[faucet.circle.com](https://faucet.circle.com) (select **Arc Testnet**, paste
the printed wallet address). Press Enter to continue; the script also tests
a transfer to verify end-to-end connectivity.

## Running

```bash
npm run dev       # http://localhost:3000
```

## Demo script

1. Open http://localhost:3000.
2. **Create two influencers** with real Arc Testnet wallet addresses (or any
   0x addresses you control).
3. **Create one campaign link per influencer** pointing to the same merchant
   URL.
4. **Copy one tracking link**, open it in an incognito/private window → you're
   redirected to the merchant URL; a click event is logged under a new
   anonymous cookie.
5. Wait a minute. **Copy the other tracking link** and open it in the same
   incognito window → second click logged for the same subject.
6. Back on the dashboard, click the **subject's timeline** link.
7. Pick an amount (e.g. $5) and click **Resolve attribution** → you land on
   the decision's payouts page.
8. Click **Trigger payouts** → one Circle transaction per influencer gets
   initiated; the page polls until each lands on-chain.
9. Click the transaction hash to open Arcscan and prove settlement.

## API

All endpoints are unauthenticated (local demo only). See
[`docs/product-brief.md §5`](docs/product-brief.md#5-api-surface) for the
full specification.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/influencers` | Create an influencer |
| `GET`  | `/api/influencers` | List influencers |
| `POST` | `/api/campaign-links` | Create a trackable link |
| `GET`  | `/api/campaign-links` | List links |
| `POST` | `/api/events` | Log a click / landing / conversion |
| `GET`  | `/api/events?subject_id=...` | Fetch events for a subject |
| `POST` | `/api/attribution/resolve` | Resolve attribution for a subject |
| `POST` | `/api/payouts` | Trigger payouts for a decision |
| `GET`  | `/api/dashboard/overview` | Dashboard summary data |
| `GET`  | `/api/dashboard/timeline/{subject_id}` | Timeline + decisions for a subject |
| `GET`  | `/api/dashboard/payouts/{decision_id}` | Decision details + live payout status |
| `GET`  | `/r/{code}` | Tracking redirect (logs click, sets cookie) |
| `GET`  | `/api/health` | Liveness check |

## Attribution policy

**Default**: recency-weighted within a 7-day lookback.

For a conversion at time `t`, find all `click` events by the same
`anonymous_user_id` with `occurred_at ∈ [t - 7d, t]`. Weight each click by
`1 / (age_hours + 1)`, sum weights per influencer, normalize, and allocate
the conversion amount proportionally.

**Fallback**: `last_click` — the most recent eligible click wins 100%.

Both policies persist a human-readable `rationale` JSON that the dashboard
renders verbatim, so the math is never a black box.

## Layout

```
app/              Next.js App Router (pages + API routes)
  api/            HTTP endpoints
  dashboard/      Timeline + payouts views
  r/[code]/       Click-tracking redirect
lib/
  db.ts           SQLite connection + schema
  circle.ts       Circle SDK client factory
  payout.ts       USDC transfer + status helpers
  payouts-service.ts  Decision → payouts workflow
  attribution.ts  Recency-weighted engine
  http.ts         JSON response helpers
scripts/
  create-wallet.ts  One-time platform wallet setup
docs/
  product-brief.md  Source of truth for scope
```

## Out of scope for the hackathon

Per [`docs/product-brief.md §8`](docs/product-brief.md#8-guardrails):

- Full future-product feature set
- Brick-and-mortar attribution / geofencing
- Social graph / probabilistic attribution
- Authentication, rate limiting, multi-tenant isolation

## Security

- Testnet credentials only. Do NOT reuse these on mainnet.
- `.env`, `data/`, and `output/` are gitignored.
- There is no auth on the API — fine for a local demo, not for production.
