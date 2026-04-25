# Full Pipeline E2E — PM Verification Record

**Date:** Apr 23, 2026 (PDT) · run timestamp `2026-04-24T05:58–06:08Z`
**Status:** Verified · pipeline green end-to-end
**Network:** Arc Testnet
**Authorization:** PM approval — "proceed with full end-to-end pipeline run"
**Scope:** click → conversion → attribution → `POST /api/payouts` → on-chain confirmation
**Guardrails honored:** no new features, no refactors, no new wallets, single controlled run

---

## Headline

The full production path from tracking click to confirmed USDC payout executed
without any manual intervention and without any code fixes required. Two
Circle transactions landed on Arc Testnet in roughly 17 seconds from `POST
/api/payouts` to dashboard `complete`. All Definition-of-Done criteria for the
MVP are now exercised against live infrastructure.

| Metric | Value |
|---|---|
| Pipeline steps passed | 8 / 8 |
| Payouts initiated | 2 |
| Payouts reaching `COMPLETE` | 2 |
| On-chain confirmations | 2 |
| Errors encountered | 0 |
| Code changes required | 0 |
| Recipient balance delta (expected $0.20) | +$0.200000 USDC |
| Platform balance delta (principal $0.20 + gas) | −$0.200905 USDC |

---

## Scenario

To keep the test self-contained and budget-safe, both influencers pointed at
the same existing test recipient wallet (the only non-platform wallet we
own). The engine still produced two independent Circle transactions, each with
its own `circle_tx_id` and `tx_hash`; the receiving wallet's balance confirms
the sum. This is the only deliberate deviation from a "two distinct wallets"
setup — called out here so it does not surprise the PM in the dashboard.

| Entity | ID | Notes |
|---|---|---|
| Influencer A — "E2E Creator A" | `DAju3QaSFvSN` | wallet `0x74cd…65ca6` |
| Influencer B — "E2E Creator B" | `SJm-_hEnXgj8` | wallet `0x74cd…65ca6` |
| Campaign link A | `cIcU-qoP` | `http://localhost:3000/r/cIcU-qoP` |
| Campaign link B | `h_0-qT77` | `http://localhost:3000/r/h_0-qT77` |
| Subject (visitor cookie) | `anon_MFE_-_57REYI23nu` | 2 clicks + 1 conversion |
| Conversion event | `mOZd9FSr8-0x` | amount_usd = `0.20` |
| Attribution decision | `ZX5lPvXmPQMj` | method `recency_weighted`, window 30d |

---

## Pipeline execution — step by step

### 1. Scenario seeding (dashboard APIs)

- `POST /api/influencers` × 2 — both accepted, IDs above.
- `POST /api/campaign-links` × 2 — returned the expected `tracking_url`s.
- `GET /r/cIcU-qoP` then (3 s later) `GET /r/h_0-qT77` with a shared cookie
  jar. Response was `302` on both, `visitor_uid` set on the first hit and
  reused on the second. Server logged two `click` events with distinct
  `occurred_at` timestamps.

### 2. Conversion

- `POST /api/events` with `event_type=conversion`, `amount_usd=0.20`. Event
  ID `mOZd9FSr8-0x`.

### 3. Attribution resolution (recency-weighted)

- `POST /api/attribution/resolve` returned `decision.id=ZX5lPvXmPQMj` in
  ~450 ms.
- Both clicks fell inside the 30-day lookback window with near-equal
  recency, so the engine split 50 / 50 as expected:

| Influencer | Raw weight | Normalized | Amount |
|---|---|---|---|
| Creator B (click +3s) | 0.953206 | 0.500201 | $0.10 |
| Creator A (click +0s) | 0.952441 | 0.499799 | $0.10 |

- Rationale JSON stored with the decision (`window_start`, `window_end`,
  per-click `age_hours`, per-influencer normalized weight, `notes: []`).

### 4. Payout initiation

- `POST /api/payouts` with `decision_id=ZX5lPvXmPQMj` — HTTP `201` in
  1.96 s, returning two payout records in state `sending` with Circle
  transaction IDs attached.

| Payout ID | Influencer | Circle tx ID | Initial state |
|---|---|---|---|
| `LWVlXXxZsBrt` | E2E Creator B | `becc31d8-8ec0-5473-a888-41f06fb33673` | `sending` |
| `jngRxfC41LuH` | E2E Creator A | `55f12060-6602-5140-b339-b63755c5b38f` | `sending` |

### 5. Dashboard polling (same code path as the UI)

- `GET /api/dashboard/payouts/ZX5lPvXmPQMj` was polled at 3 s intervals.
- On poll #1 both rows had already transitioned to `complete` with
  populated `tx_hash` and `explorer_url`. Elapsed from `created_at` to
  `updated_at` was ~17.3 s and ~17.4 s respectively — consistent with
  the previous single-payout test.

### 6. On-chain confirmation

| Influencer | txHash | Arcscan |
|---|---|---|
| E2E Creator B | `0x197acf3602c28eed8bf5349a8ff88067bcfe7ef4c0ee1ee3a18043d8fa623342` | [link](https://testnet.arcscan.app/tx/0x197acf3602c28eed8bf5349a8ff88067bcfe7ef4c0ee1ee3a18043d8fa623342) |
| E2E Creator A | `0x929bb9d366cb39cf457cf93c2fc930d6009bbfce9042bed2628eccd8c54c89c7` | [link](https://testnet.arcscan.app/tx/0x929bb9d366cb39cf457cf93c2fc930d6009bbfce9042bed2628eccd8c54c89c7) |

Arcscan returned HTTP 200 for both pages.

### 7. Dashboard timeline + overview endpoints

- `GET /api/dashboard/timeline/anon_MFE_-_57REYI23nu` returned the two
  click events and the conversion event in chronological order, plus the
  decision summary. Display names and merchant domain resolved correctly.
- `GET /api/dashboard/overview` showed `payout_count=2`,
  `payout_complete_count=2` for the decision — the UI counter the PM
  will see on the demo.

### 8. Balance reconciliation (`npm run fetch-wallets`)

| Wallet | Before | After | Delta |
|---|---|---|---|
| Recipient `0x74cd…65ca6` | 5.100000 USDC | 5.300000 USDC | **+0.200000** |
| Platform `0x9919…ac3a` | 14.899097 USDC | 14.698192 USDC | **−0.200905** |

Gas footprint for the pair of transfers: **~0.000905 USDC total**
(~$0.0004525 per tx), paid from the platform wallet in native USDC.

---

## Dashboard behavior observed

- Timeline endpoint surfaces click / conversion / decision rows in a single
  payload ready for the timeline view.
- Payouts endpoint returns decision + rationale + payout rows with a live
  `status` refresh on each call — sufficient for the existing UI polling
  loop (polls every ~3 s and stops when all rows reach a terminal state).
- Explorer URL is populated alongside `tx_hash`, so the "view on Arcscan"
  link in the dashboard will be click-ready the moment a payout completes.

---

## Failures and fixes

- None. No code path needed adjustment during this run. The native-USDC fix
  shipped earlier today (empty `tokenAddress` on Arc Testnet) continues to
  hold under multiple simultaneous transactions.

---

## Residual risks / observations

| Risk | Severity | Note |
|---|---|---|
| Both demo influencers share a wallet | Low | Only an artifact of our 2-wallet testnet setup; production would enforce distinct addresses via influencer onboarding. Called out so the PM isn't surprised in the dashboard. |
| Dashboard payout polling latency | Low | First poll already terminal. No evidence of stuck `sending` state, but we only have 3 real samples (the earlier single payout + this pair). |
| Gas sits on the same wallet as payout principal | Low | Well-documented, matches prior run. Top-up cadence to be decided before public demo. |
| Pipeline not yet exercised on a differently-distributed recency (e.g. 1 old + 1 fresh click) | Low | The recency-weight math produced near-50/50 here because clicks were 3 s apart. A skewed-weight demo would need a wider time gap — not required for DoD, but would be a stronger story on stage. |

---

## Data written / captured during the run

- `data/wallets.json` — updated to post-run balances (gitignored).
- Dev-server log: `/tmp/proto-circle-dev.log` (ephemeral, not committed).
- Decision `ZX5lPvXmPQMj`, payouts `LWVlXXxZsBrt` / `jngRxfC41LuH`, and
  all associated events persist in the SQLite DB (`data/*.db`, gitignored).
- No secrets, no new wallets, no code or `.env` changes.

---

## PM decisions already resolved by this run

1. **DoD on-chain verification — multi-payout case:** passed (was open as of
   `05-first-live-payout.md`, which only covered a single payout).
2. **Dashboard status polling correctness:** verified against the same
   endpoint the UI consumes.
3. **Balance accounting accuracy:** platform debit = principal + gas;
   recipient credit = exact principal. Matches expectations.

---

## Open PM decisions — follow-up

1. **Demo wallet topology.** For the public demo, do we (a) create a second
   non-platform wallet so both creators have distinct addresses in the
   dashboard, or (b) keep the current shared-address setup and script a
   narrative around it? Impact: creating a wallet requires one Circle call
   and $0 spend; narrative-only requires $0 and 0 engineering.
2. **Skewed-weight demo.** Do we want a canned scenario where one click is
   several hours older than the other, to showcase the recency curve on
   stage? Current setup always produces ~50/50 because clicks are seconds
   apart.
3. **Credential rotation.** Testnet keys remain in `.env` from the
   restored backup. Per original PM directive, rotation is deferred until
   just before any public push. Confirm we still want to hold that line.
4. **Status-docs index.** We now have `05-first-live-payout.md` +
   `06-full-pipeline-e2e.md` alongside the older dated briefings. Want
   a short `docs/status/README.md` index before the demo?

---

## References

- `docs/status/mvp-status-report.md` — overall status (will be updated on
  PM approval to reference this doc).
- `docs/status/05-first-live-payout.md` — preceding single-payout run.
- Transaction explorer:
  - https://testnet.arcscan.app/tx/0x197acf3602c28eed8bf5349a8ff88067bcfe7ef4c0ee1ee3a18043d8fa623342
  - https://testnet.arcscan.app/tx/0x929bb9d366cb39cf457cf93c2fc930d6009bbfce9042bed2628eccd8c54c89c7
