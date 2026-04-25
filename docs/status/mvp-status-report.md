# MVP Status Report — Instant Attribution & Micropayments Engine

**Status:** Demo-ready · **Live on-chain verification:** Complete (single + multi-payout) · **Full pipeline E2E:** Verified
**Reporting period:** Apr 19 (initial Circle prototype) → Apr 23 (full pipeline E2E verified)
**Repo:** `proto-circle` · **Branch:** `main`
**Audience:** Project Manager + Product Owner

> Working name: "Instant Attribution & Micropayments Engine." Any transition
> to long-term product branding in public artifacts requires explicit
> product-owner sign-off.

---

## Headline

The MVP is code-complete against the hackathon brief. All endpoints, the
attribution engine, the Circle payout integration, and the dashboard are
implemented and smoke-tested end-to-end. The first live on-chain USDC
transfer was executed successfully on Arc Testnet (see
[`05-first-live-payout.md`](./05-first-live-payout.md)), and the full
click → conversion → attribution → payout pipeline has since been
exercised end-to-end through the same code path the dashboard uses, with
two concurrent Circle transfers and reconciled balances (see
[`06-full-pipeline-e2e.md`](./06-full-pipeline-e2e.md)). Every Definition
of Done criterion is now verified against live infrastructure.

| Metric | Value |
|---|---|
| Build tasks complete | 11 / 11 |
| API endpoints shipped | 13 |
| Definition-of-Done criteria met | 5 / 5 |
| Critical verifications pending | 0 |

---

## Scope vs. progress

| Workstream | Status | Notes |
|---|---|---|
| Repo hygiene & secrets cleanup | Complete | Public history rewritten; placeholder/env material purged; local backup retained offline. |
| Product docs & agent context | Complete | `docs/product-brief.md`, `AGENTS.md`, `.env.example`, full `README.md` — all neutrally named. |
| Storage & data model | Complete | SQLite schema covering six entities from the brief; FK constraints on. |
| Attribution engine | Complete | Recency-weighted (default) and last-click, with persisted rationale. |
| Circle payout integration | Complete | USDC transfer helpers plus orchestrated payouts service with idempotency. |
| Dashboard UI | Complete | Overview, timeline, and live-polling payouts views. |
| End-to-end on-chain verification (single payout) | **Complete** | Apr 23, 2026 — $0.10 USDC platform → test recipient on Arc Testnet in ~4 s. Tx `0xe10ceaea248f4da13e3b79d0e83fe0a408e4bee6e5729f9631e466c118b5de8d` ([arcscan](https://testnet.arcscan.app/tx/0xe10ceaea248f4da13e3b79d0e83fe0a408e4bee6e5729f9631e466c118b5de8d)). Record: [`05-first-live-payout.md`](./05-first-live-payout.md). |
| Full pipeline E2E (click → payouts, multi-transfer) | **Complete** | Apr 23, 2026 — 2 clicks, 1 conversion, 1 attribution decision, 2 concurrent Circle transfers to `COMPLETE` in ~17 s; balances reconciled (−$0.200905 platform / +$0.200000 recipient incl. gas). Record: [`06-full-pipeline-e2e.md`](./06-full-pipeline-e2e.md). |

---

## Key events this period

| When | Event | Outcome |
|---|---|---|
| Apr 19 | Initial Circle prototype | `create-wallet.ts` working: entity secret + wallet set + two wallets + USDC transfer on Arc Testnet. |
| Apr 22 (early) | Public repo audit | Sensitive test material found in public history. Testnet-only, so no rotation required; repo was cleaned. |
| Apr 22 | Product brief intake | Scope locked: online-only, recency-weighted attribution, instant USDC payout, visible audit trail. |
| Apr 22 | MVP build | Next.js app scaffolded; 13 endpoints and 3 dashboard views shipped; smoke-tested. |
| Apr 22 (late) | Brand-name scrub | All long-term brand references removed from README, docs, dashboard, status report. |
| Apr 23 | Env restoration + balance tooling | `.env` restored; `fetch-wallets` extended with balance lookup; demo unblocked. |
| Apr 23 | Native-USDC transaction fix | `lib/payout.ts` updated to send native USDC on Arc Testnet (empty `tokenAddress`). |
| Apr 23 | **First live on-chain payout verified** | $0.10 USDC platform → test recipient on Arc Testnet; `COMPLETE` in ~4s. See [`05-first-live-payout.md`](./05-first-live-payout.md). |
| Apr 23 | **Full pipeline E2E verified** | click → conversion → recency-weighted attribution → 2 concurrent Circle transfers; both `COMPLETE` in ~17 s, balances reconciled. See [`06-full-pipeline-e2e.md`](./06-full-pipeline-e2e.md). |
| Apr 23 | Demo-wallet policy + skewed scenario prepared | PM directive: demo scenarios must use two distinct creator wallets, neither being the platform wallet. Runnable 70/30 scenario scripted at `scripts/demo-skewed-attribution.sh` (uses existing APIs; no code changes). |

---

## Definition of Done — checklist

| Criterion (from brief) | Status | Where it lives |
|---|---|---|
| Link click is recorded. | Complete | `/r/{code}` route: sets anonymous cookie, writes click event, redirects. Exercised live in [`06-full-pipeline-e2e.md`](./06-full-pipeline-e2e.md). |
| Event logging persists timestamped interactions. | Complete | `POST /api/events` + SQLite `user_events` table. |
| Attribution calculation explains who got credit and why. | Complete | Recency-weighted engine with persisted rationale JSON; live-verified in [`06-full-pipeline-e2e.md`](./06-full-pipeline-e2e.md). |
| Payout initiation triggers a real stablecoin transfer. | Complete (live) | `POST /api/payouts` → Circle `createTransaction` on Arc Testnet; verified single in [`05-first-live-payout.md`](./05-first-live-payout.md) and concurrent multi-payout in [`06-full-pipeline-e2e.md`](./06-full-pipeline-e2e.md). |
| Visible audit trail for the whole loop. | Complete | Dashboard: overview → timeline → decision rationale → live payout status + explorer link. Polling behavior verified in [`06-full-pipeline-e2e.md`](./06-full-pipeline-e2e.md). |

---

## Capabilities delivered

- **Creator & link management.** Register a creator with a display name and
  Arc wallet address; generate unique 8-character campaign links per
  creator and merchant target URL.
- **Click capture.** Every `/r/{code}` visit writes a timestamped click
  event keyed to a long-lived anonymous cookie, then redirects to the
  merchant URL. Exact duplicates deduplicated.
- **Attribution.** Recency-weighted (default, 7-day lookback) or last-click
  fallback. Every decision persists the full eligible-clicks list, raw
  weights, normalized shares, and USD allocations as a rationale object the
  dashboard renders verbatim.
- **Instant USDC payouts.** One Circle developer-controlled-wallet transfer
  per attributed creator, kicked off from the decision page. Status polls
  until on-chain settlement, surfacing the `tx_hash` with a direct
  block-explorer link.

---

## Gaps vs. the brief

| Area | Gap | Impact |
|---|---|---|
| Merchant auth | Brief mentions "lightweight merchant token or demo-only key"; not implemented. | Acceptable for local demo; unshippable for real merchant integration. |
| Landing events | API accepts `landing` events but the attribution engine only weights `click` events today. | Minor — attribution math would need a small extension if landing weight is desired. |
| Merchant-side conversion emission | Conversions are triggered from the dashboard; no merchant webhook/pixel story. | Fine for a staged demo; visually clearer if masked as a merchant callback. |

---

## Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| ~~Live on-chain payout not yet verified.~~ | ~~Medium~~ → **Retired** | Resolved Apr 23, 2026 by the first controlled live payout ([`05-first-live-payout.md`](./05-first-live-payout.md)) and the full pipeline E2E run ([`06-full-pipeline-e2e.md`](./06-full-pipeline-e2e.md)). |
| Demo scenario currently needs a second non-platform creator wallet. | Low | PM-approved policy: demo scenarios must use two distinct creator wallets, neither being the platform wallet. Scenario script (`scripts/demo-skewed-attribution.sh`) refuses to run unless both are provided and distinct. Wallet provisioning itself is a one-call action and remains an open decision. |
| Testnet credentials remain in the restored `.env` (not committed). | Low | **Rotation deferred by PM directive until just before any public push.** Confirmed Apr 23, 2026. Rotation runbook to be drafted as part of the pre-push checklist. |
| `scripts/create-wallet.ts` is not idempotent — rerunning fails because the Circle entity secret is already registered. | Low | Small refactor: short-circuit when the entity secret is already registered. ~15-minute fix. |
| No authentication on API endpoints. | Low (for demo) | Acceptable per hackathon scope; add a merchant token before any non-demo exposure. |

---

## Decisions needed from the Product Owner

- **Demo framing.** Should the conversion trigger on the live demo look
  like a dashboard button, or should it be presented as a merchant
  thank-you page calling our API? The second feels more credible but adds
  ~30 minutes of work.
- **Creator-side view.** The current dashboard is operator-facing. Do we
  also want a minimal creator view ("your links, your clicks, your
  earnings") to land the "trust layer" thesis harder? Out of scope unless
  explicitly prioritized.
- **Deployment target.** Local-only is enough for the Definition of Done.
  If the audience should access the dashboard live, we need a deployment
  decision (Vercel + a SQLite-compatible hosted DB is the fastest path).
- **Policy defaults.** Recency-weighted with a 7-day window is the current
  default. Confirm both parameters; the engine accepts overrides per
  request but the dashboard exposes only method (not window).

---

## Recommended next 48 hours

1. ~~Run the full pipeline end-to-end through the dashboard.~~ Done
   Apr 23 — see [`06-full-pipeline-e2e.md`](./06-full-pipeline-e2e.md).
2. Provision a second non-platform creator wallet so both demo creators
   in `scripts/demo-skewed-attribution.sh` satisfy the new policy
   without a placeholder. One-call action; awaiting PM confirmation.
3. Make `scripts/create-wallet.ts` idempotent so the setup step is safe to
   re-run.
4. Rehearse the six-step demo script from the brief, including the
   skewed-split scenario (`scripts/demo-skewed-attribution.sh`).
5. Draft the pre-public-push checklist that includes credential rotation,
   so deferral is explicit and timed.

---

_Prepared from the `proto-circle` working tree. No secrets, API keys, or
`.env` contents are reproduced in this document._
