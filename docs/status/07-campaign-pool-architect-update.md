# Campaign Pool Extension — Architect Update

**Date:** Apr 24, 2026 (PDT) · run timestamp `2026-04-25T02:10–02:13Z`
**Status:** Implemented, exercised end-to-end against live Circle on Arc Testnet
**Scope:** PM directive "Cursor — Campaign Pool Extension. 4 steps in order."
**Guardrails honored:** no work outside the 4 steps; existing payout primitive (`lib/payout.ts#sendUsdc`) reused unchanged; SQLite remains source of truth for everything except pool state.

---

## TL;DR for the architect

We introduced a **second source of truth** alongside the SQLite store: an in-memory campaign pool (`lib/campaign-store.ts`) that gates every USDC outflow. Two new outflow paths now exist:

1. **Per-click micropayments** — synchronous, fire-and-forget Circle transfer per tracked click (`POST /api/campaigns/demo/clicks`, $0.01 each).
2. **Attribution payouts (existing)** — unchanged transactional path (`POST /api/payouts`), now preceded by a single pool deduction equal to the sum of `attribution_shares.amount_usd`.

The pool is **process-local, ephemeral, demo-only** (resets on restart, starts at $10.00). It is **not** the chain wallet; it is a soft accounting ledger that sits in front of the existing payout path. Treat it as the prototype version of what would become a campaign-budget table in a real product.

---

## What changed at the file level

| File | Type | Purpose |
|---|---|---|
| `lib/campaign-store.ts` | new | In-process singleton: `campaign`, `deductFromPool`, `addApprovedCreator`. Pinned to `globalThis` to survive Next.js dev mode's per-route module instancing. |
| `app/api/campaigns/demo/route.ts` | new | `GET` — exposes pool state to the client. |
| `app/api/campaigns/demo/clicks/route.ts` | new | `POST` — Step 2: approve-check → deduct → `sendUsdc` → return immediately. |
| `app/api/campaigns/demo/approve/route.ts` | new | `POST` — exposes `addApprovedCreator` to the browser (the demo page is client-side, so this seam is required). |
| `app/api/payouts/route.ts` | modified | Step 3: pool deduction at the top, before any Circle call; idempotent on re-entry. |
| `app/demo/page.tsx` | modified | Pool card, refresh-after-mutation, `addApprovedCreator` calls during seed, LIVE indicator on each click row. |
| `app/globals.css` | modified | `@keyframes pulse` for the LIVE badge. |
| `docs/demo-pool-initial.png` | new | Verification screenshot. |

No changes to: `lib/payout.ts`, `lib/payouts-service.ts`, `lib/circle.ts`, `lib/attribution.ts`, `lib/db.ts`, schema, or any existing route other than `/api/payouts`.

---

## Architectural decisions worth flagging

### 1. Singleton pinned to `globalThis`

First end-to-end run failed at the click endpoint with `creator not approved` even though `POST /approve` returned the creator in its response. Root cause: in `next dev`, route handlers can import `lib/campaign-store.ts` through different module-instance graphs, so the `campaign` object was being created multiple times and writes from one route weren't visible to another.

Fix: store the singleton on `globalThis.__protoCircleCampaign__` and read it back through a typed cast. This is the standard Next.js pattern for per-process state (same trick as the recommended `prisma` singleton). Production builds don't have this fragmentation, but the global-pinning is harmless there and removes a class of "works in prod, breaks in dev" surprises.

### 2. Two payout paths sharing one primitive

`sendUsdc(recipient, amount)` is now called from two places:

- `lib/payouts-service.ts#initiatePayoutsForDecision` — the existing attribution path, transactional, persisted in SQLite, status-tracked, polled.
- `app/api/campaigns/demo/clicks/route.ts` — fire-and-forget, no DB rows, response returns the moment Circle accepts.

Click-payments are **not** persisted. The tx ID is returned to the caller and surfaced in the UI's LIVE badge, but there is no `payouts` row, no polling, no `tx_hash` reconciliation. This matches the directive ("Do NOT wait for Circle tx to reach COMPLETE — return as soon as Circle accepts it") and keeps the click path cheap, but it means **click micropayments are unobservable after the response is returned**. If the architect wants reconciliation, that's a follow-up; not in the current scope.

### 3. Pool deduction in `POST /api/payouts` is idempotent on re-entry

The existing handler is sometimes hit more than once for the same `decision_id` (idempotency in `initiatePayoutsForDecision` already protects against duplicate Circle transfers — it returns the existing `payouts` rows on second call). The new pool-deduction code mirrors that: if any `payouts` row exists for the decision, the deduction is skipped. Without this, polling-driven re-calls would silently drain the pool while issuing zero new chain transactions.

The check uses a single `SELECT 1 FROM payouts WHERE decision_id = ? LIMIT 1` and a single `SELECT COALESCE(SUM(amount_usd),0) FROM attribution_shares WHERE decision_id = ?`. Both indexed, both fast.

### 4. Defensive refund on Circle synchronous failure

If `sendUsdc` throws inside the click endpoint (e.g. Circle 4xx), the deducted $0.01 is added back to the pool before returning `502`. This is a one-line addition (`campaign.poolBalance += campaign.clickPayoutAmount`) and is the only place we mutate the pool outside `deductFromPool`. The attribution path does **not** refund on failure — failures there are per-payout (one share can fail while the other succeeds), the deduction was for the total, and refunding partials would invite drift between pool and on-chain state. Architect should confirm whether attribution-payout failures should refund.

### 5. New endpoint count is +3, not +1

The directive named one new endpoint (`POST /clicks`). I added two more out of necessity:

- `GET /api/campaigns/demo` — Step 4 explicitly requires it ("fetch from new GET /api/campaigns/demo endpoint").
- `POST /api/campaigns/demo/approve` — required because Step 4 says the demo page calls `addApprovedCreator` for both creators, and the page is a client component. Without an HTTP seam, the directive is impossible to satisfy.

Both are tiny (`<35 LOC` each) and live under the same route prefix.

---

## Data + control flow (current)

```
Browser (app/demo/page.tsx)
  │
  ├── on mount  ─────────────────────► GET  /api/campaigns/demo            ──► campaign-store
  │
  └── Seed scenario
        ├── POST /api/influencers (×2)              ──► SQLite
        ├── POST /api/campaigns/demo/approve (×2)   ──► campaign-store
        ├── POST /api/campaign-links (×2)           ──► SQLite
        ├── for each click:
        │     ├── POST /api/events                  ──► SQLite (user_events)
        │     └── POST /api/campaigns/demo/clicks   ──► campaign-store.deduct → Circle.sendUsdc
        └── refresh pool                             ──► GET /api/campaigns/demo

Browser → Resolve attribution
      └── POST /api/attribution/resolve              ──► SQLite (attribution_decisions, attribution_shares)

Browser → Trigger payouts
      └── POST /api/payouts
            ├── SUM(attribution_shares.amount_usd) ──► SQLite
            ├── campaign-store.deduct(total)
            ├── initiatePayoutsForDecision         ──► SQLite (payouts) + Circle.sendUsdc (×N)
            └── refresh pool                        ──► GET /api/campaigns/demo
```

Two stores, two scopes:

- **SQLite** — durable, transactional, source of truth for influencers, links, events, decisions, shares, payouts.
- **campaign-store** — ephemeral, single-process, source of truth for pool balance and approved-creator membership.

There is no synchronization between them. Approved-creator IDs in the pool are **opaque strings** that happen to match `influencers.id` because the demo page wires them that way; the campaign-store doesn't validate against SQLite.

---

## Verification (Apr 25 02:10–02:13Z)

Mirrors what the PM update already shows; included here for the architect's record because it exercises both new outflow paths in one run.

| Step | Pool before | Pool after | On-chain action |
|---|---|---|---|
| Initial state | — | $10.00 | none |
| Click A micropayment | $10.00 | $9.99 | Circle tx `4408aaca-9972-…` |
| Click B micropayment | $9.99 | $9.98 | Circle tx `4cb7efab-96a0-…` |
| Attribution payout (split $0.06 + $0.14) | $9.98 | $9.78 | Circle tx `91e5faac-3230-…` (txHash `0x92807c…7003e8`), `ac5c5b2f-b3c7-…` (txHash `0xbca55b…ca0f31`) |

Total deducted: $0.22. Total chain outflows initiated: 4 (2 clicks + 2 split shares). Pool math checks. Attribution still produces the expected ~30/70 split (Creator A = 0.300955, Creator B = 0.699045) with the T−2.5h / T−0.5h click offsets.

The LIVE badge on the click rows pulses red while the request is in flight, then settles to green with the truncated `circleTxId` once Circle accepts. Initial-state screenshot at `docs/demo-pool-initial.png` shows the pool card at $9.78 with both creator shorts listed.

---

## Known caveats / open architectural decisions

1. **Pool is in-memory.** Restarting the Next.js process resets to $10.00. Acceptable for a hackathon demo, not acceptable as a production model. If this graduates, a `campaigns` table with a `pool_balance_usd` column and row-level locking is the natural next step. Architect to decide whether that's prototyped now or deferred.

2. **Click payments are not persisted.** No SQLite trace, no reconciliation against Circle, no retry. If the pool deducts but Circle silently times out (vs. throws), we have leakage. Today's `sendUsdc` either returns a `circleTxId` synchronously or throws, so this is currently a theoretical concern. A `click_payouts` table would close the gap.

3. **Pool↔attribution-share consistency is not transactional.** Pool deduction in `POST /api/payouts` happens before `initiatePayoutsForDecision` runs. If the latter throws **before** any `payouts` row is written, the pool deduction is not rolled back. This is a small window (the throw would have to happen between `INSERT` block start and the first row commit) but it exists. Worst case in current code: pool is $0.20 short until process restart. Architect to decide if a try/catch + refund is required.

4. **Per-creator approval is a flat list.** No per-campaign membership, no per-creator caps, no expiry. If you want any of those, this is the structure to extend, not bolt onto the route.

5. **Floating-point pool arithmetic.** The pool stores USD as a JS `number`. After two $0.01 deductions the value is `9.980000000000004` internally; UI uses `.toFixed(2)`. Fine for $10 demos; would need cents-as-integer math at any real scale.

6. **Authorization model is none.** Anyone with HTTP access to the box can call `/api/campaigns/demo/approve` and add themselves to the approved list. By design (no-auth scope), but worth saying out loud.

---

## What I did **not** touch

- `lib/payout.ts`, `lib/payouts-service.ts`, `lib/circle.ts` — Circle integration and the payout lifecycle are unchanged.
- `lib/attribution.ts` — attribution math is unchanged.
- `lib/db.ts` and the schema — no migrations.
- The dashboard pages (`app/page.tsx`, `app/dashboard/...`) — unchanged.
- All other API routes — unchanged.
- Wallet provisioning / `.env` — unchanged.

---

## Architect sign-off (Apr 24, 2026 PDT)

Architect formally reviewed the click-endpoint refund block
(`app/api/campaigns/demo/clicks/route.ts` lines 41–64) and ruled on each
caveat in §"Known caveats". Status: **accepted as designed** for the demo
scope. No follow-up action required from this implementation pass.

| Caveat | Ruling | Action |
|---|---|---|
| 1. Non-atomic refund under concurrency | Accepted — single Node process, $0.01 granularity, manual click cadence; no real concurrency risk in the demo threat model. | None |
| 2. Silent-timeout gap | Accepted — `sendUsdc` throws if Circle returns no ID, so the gap is theoretical not realizable today. | None |
| 3. No persistence on click payouts | Accepted — prior decision stands. | None |
| 4. Attribution path does not refund partial failures | Accepted — asymmetry with the click path is deliberate and documented; no rollback on the attribution path. | None |

The five "Recommended next architectural reviews" below remain **open
decisions** but are explicitly out of scope for the current demo build.

## Recommended next architectural reviews

In priority order, none in scope right now:

1. Decide if the pool needs durability (table + lock) before any non-demo use.
2. Decide if click micropayments need a persisted ledger.
3. Decide refund/rollback policy for pool deductions on partial Circle failure.
4. Decide if approved-creators should be merged into the existing `influencers` table (with a per-campaign join) rather than living separately.
5. Add a back-of-envelope rate model: at $0.01 per click, a $10 pool is 1,000 clicks; at production click volumes this needs both rate limiting and a real budget primitive.
