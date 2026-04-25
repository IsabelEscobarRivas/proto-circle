# First Live Payout — PM Verification Record

**Date:** Apr 23, 2026 (PDT)
**Transaction timestamp:** 2026-04-24T05:41Z (UTC)
**Status:** Verified · `COMPLETE` on-chain
**Network:** Arc Testnet
**Authorization:** PM directive, single controlled transaction, parameters hard-coded

---

## Headline

The first live on-chain payout using the production payout path
(`lib/payout.ts#sendUsdc`, the same code invoked by `POST /api/payouts`)
succeeded on the first attempt. Circle accepted the native USDC transfer
with an empty `tokenAddress` and returned `COMPLETE` in roughly four
seconds. Every Definition-of-Done criterion on the payout leg is now
exercised against real Circle infrastructure.

| Metric | Value |
|---|---|
| Final state | `COMPLETE` |
| Elapsed (accept → COMPLETE) | ~4 seconds |
| Errors | None |
| Code changes required | None |

---

## Test parameters (as authorized)

| Parameter | Value |
|---|---|
| Amount | 0.10 USDC |
| Source wallet (role) | Platform payout wallet |
| Source address | `0x9919d90b8debbfa5d126aad522935966b2deac3a` |
| Destination wallet (role) | Test recipient wallet |
| Destination address | `0x74cd72c679248d815249d5269ad8bf07dc265ca6` |
| Network | ARC-TESTNET (Circle's L1 for stablecoins) |
| Execution path | `scripts/test-live-payout.ts` → `sendUsdc()` (same as `POST /api/payouts`) |

Parameters were hard-coded in the test harness so the script could not be
accidentally reused for a different amount or recipient.

---

## Transaction identifiers

| Field | Value |
|---|---|
| Circle transaction ID | `1076cce4-054d-5195-9eb2-79608802f663` |
| On-chain transaction hash | `0xe10ceaea248f4da13e3b79d0e83fe0a408e4bee6e5729f9631e466c118b5de8d` |
| Block explorer | https://testnet.arcscan.app/tx/0xe10ceaea248f4da13e3b79d0e83fe0a408e4bee6e5729f9631e466c118b5de8d |

---

## Status progression (observed)

| Elapsed | Event |
|---|---|
| `+0.0s` | `sendUsdc()` invoked |
| `+0.9s` | Circle accepted transaction; initial state `INITIATED`; Circle transaction ID returned |
| `+4.0s` | Terminal state `COMPLETE` with on-chain `txHash` populated |

Circle's testnet returned `COMPLETE` on the first 3-second poll.
Intermediate states (`QUEUED`, `SENT`, `CONFIRMED`) were not observed as
distinct events — they either collapsed inside Circle or transitioned
faster than our polling interval. This has no effect on correctness.

---

## Balance change summary

| Wallet | Pre-run | Post-run | Delta | Expected |
|---|---|---|---|---|
| Platform payout wallet `0x9919…ac3a` | 14.9995485 USDC | 14.899097 USDC | −0.1004515 USDC | −$0.10 + gas |
| Test recipient wallet `0x74cd…65ca6` | 5 USDC | 5.1 USDC | +0.1 USDC | +$0.10 |

- Recipient received exactly **$0.10 USDC**, matching the authorized amount.
- Platform wallet paid **$0.10 principal + ~$0.0004515 USDC gas** — native
  Arc Testnet gas, effectively negligible.
- Value conservation holds: `0.1004515 − 0.1 = 0.0004515 USDC in gas`.

Post-run balances are live in `data/wallets.json` (gitignored). Re-running
`npm run fetch-wallets` at any time refreshes the snapshot.

---

## Risks identified before the test — resolution

| Risk (from previous update) | Resolution |
|---|---|
| Circle server-side may prefer `tokenAddress` omitted rather than empty string. | Resolved in practice. Empty string was accepted and produced a successful native USDC transfer. |
| First live payout has not yet been exercised in this codebase. | Resolved. Exercised end-to-end against production Circle API. |
| Platform wallet balance sufficient. | Confirmed. ~14.9 USDC remaining leaves ample headroom for further demo/rehearsal runs. |

---

## Remaining risks and follow-ups

| # | Item | Severity | Notes |
|---|---|---|---|
| 1 | Intermediate transaction states (`QUEUED`, `SENT`, `CONFIRMED`) were not observed. | Low | Likely a polling-cadence artifact; the state machine in `lib/payout.ts` still handles them. Not a correctness concern. |
| 2 | `idempotencyKey` is not set on `createTransaction`. | Low | Not required for single-shot demo. Recommended before any production use. |
| 3 | Fee config is hardcoded to `feeLevel: MEDIUM`. | Low | Fine for Arc Testnet (gas is negligible); revisit when mainnet is on the table. |
| 4 | `scripts/create-wallet.ts` still references the misleading `ARC_TESTNET_USDC` placeholder. | None at runtime | Not exercised by normal flows. Align before any future setup re-run. |
| 5 | Full attribution → payout pipeline (dashboard-triggered) not yet exercised end-to-end. | Medium | Deliberately deferred per PM directive. Ready to run whenever you approve. |

---

## Files created or changed by this test

| File | Change | Tracked by git? |
|---|---|---|
| `scripts/test-live-payout.ts` | **New** — one-shot harness invoking existing `sendUsdc`. Parameters hard-coded to the authorized values. | Yes |
| `package.json` | **Modified** — added `"test-live-payout"` npm script. | Yes |
| `data/wallets.json` | **Updated** — refreshed with post-run balances. | No (gitignored) |

No changes to `lib/payout.ts`, `lib/circle.ts`, `scripts/create-wallet.ts`,
wallet addresses, or `.env`.

---

## Conclusion

The previously Medium-severity risk on live on-chain verification is
**retired**. The payout leg is demo-ready in both code and live behavior.
The next logical verification is the full pipeline run
(`click → conversion → resolve-attribution → POST /api/payouts`) through
the dashboard — awaiting PM approval.

---

_No secrets, API keys, credential material, or recovery-file paths are
reproduced in this document. Wallet addresses, wallet IDs, Circle
transaction IDs, and on-chain transaction hashes are public identifiers._
