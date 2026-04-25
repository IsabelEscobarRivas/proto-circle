# Status docs — index

Chronological PM briefings for `proto-circle`. All entries are PM- or
PO-facing; no secrets, keys, or `.env` contents appear in any of them.

## Rolling status

- [`mvp-status-report.md`](./mvp-status-report.md) — overall MVP status,
  scope, risks, and open decisions. Updated as major milestones land.

## Per-event briefings (chronological)

1. [`wallet-inventory-pm-briefing.md`](./wallet-inventory-pm-briefing.md) —
   inventory of Circle wallets discovered via `fetch-wallets`; flagged the
   missing local `.env`.
2. [`env-restoration-pm-update.md`](./env-restoration-pm-update.md) — local
   `.env` restored from offline backup; app startup + balance-lookup
   tooling verified; native-USDC transaction risk flagged.
3. [`native-usdc-fix-pm-update.md`](./native-usdc-fix-pm-update.md) —
   `lib/payout.ts` updated to send native USDC on Arc Testnet (empty
   `tokenAddress`); minimal, scoped change.
4. *(no doc — the Apr 23 PM approval for a first controlled payout was
   oral / in-thread; the result is captured as file 5.)*
5. [`05-first-live-payout.md`](./05-first-live-payout.md) — first live
   on-chain payout ($0.10 USDC, platform → test recipient, Arc Testnet);
   verified `COMPLETE` in ~4 s.
6. [`06-full-pipeline-e2e.md`](./06-full-pipeline-e2e.md) — full pipeline
   run (click → conversion → resolve → payouts) with two concurrent
   transfers and balance reconciliation; retired all pre-demo pipeline
   verifications.
7. [`07-campaign-pool-architect-update.md`](./07-campaign-pool-architect-update.md)
   — campaign-pool extension (in-memory pool, click micropayments, pool
   deduction in `/api/payouts`, demo UI); architect-facing review of
   seams, invariants, and open decisions.
8. [`08-dev-server-multiplicity-bug.md`](./08-dev-server-multiplicity-bug.md)
   — pool-refresh bug report traced to two concurrent `next dev`
   processes holding independent in-memory pools; resolved
   operationally, no code change; hardening options open.

## Convention

- Files are chronological; numeric prefixes (`05-`, `06-`, …) start once
  verification records began accumulating.
- Cross-references use relative markdown links (e.g. `[text](./05-...)`)
  so they render correctly on GitHub and in local preview.
- New briefings should continue the numeric sequence
  (next would be `09-...`).
