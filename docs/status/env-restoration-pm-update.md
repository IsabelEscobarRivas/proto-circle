# Env Restoration & Balance Lookup — PM Update

**Date:** Apr 22, 2026
**Status:** All four PM directives executed · Local demo unblocked
**Network:** Arc Testnet
**Working name:** Instant Attribution & Micropayments Engine

---

## Headline

All four PM directives executed cleanly. Local demo is unblocked, platform
wallet has roughly 15 USDC on Arc Testnet, and `data/wallets.json` now
includes live balances. No credentials were rotated; no wallets were
created or modified.

| Metric | Value |
|---|---|
| `.env` restored | Yes (local, untracked) |
| Next.js dev server starts | Yes |
| Platform wallet USDC balance | ~15 USDC |
| Faucet top-up needed now | No |

---

## What was done

| Step | Action | Result |
|---|---|---|
| 1. Restore `.env` | Re-created the local testnet `.env` from an offline local backup, per PM directive. | Restored. Untracked and gitignored — will not be committed. |
| 2. Verify `.gitignore` | Checked `.env`, `output/`, and `data/` entries; ran `git check-ignore`. | `.env` and `output/` explicitly ignored; `data/wallets.json` also ignored via `data/` rule. |
| 3. Confirm app starts | Ran `npm run dev`; hit `/api/health` and `/api/dashboard/overview`. | Ready in ~1.5 s. Both endpoints returned HTTP 200. |
| 4. Add balance lookup | Extended `scripts/fetch-wallets.ts` to call `GET /v1/w3s/wallets/{id}/balances` per wallet, with per-wallet error isolation. | `data/wallets.json` now includes `usdc_balance` + full `balances[]`. Zero new dependencies. |
| 5. Honor constraints | No edits to `create-wallet.ts`. No new wallets. No address changes. `.env` not committed. | All constraints met. |

---

## Wallet balances (live from Circle)

| Role | Address | USDC |
|---|---|---|
| **Platform payout wallet** | `0x9919d90b8debbfa5d126aad522935966b2deac3a` | ~14.9995 |
| Test recipient wallet | `0x74cd72c679248d815249d5269ad8bf07dc265ca6` | 5 |

---

## Funding decision

**Proceed without a top-up.** At a typical per-conversion share of $0.10–$1
across 1–3 creators, ~15 USDC funds roughly 15–150 simulated payouts —
comfortable headroom for the live demo and several dry runs.

Top up to ~50 USDC only if any of these become true:

- Platform wallet drops below ~5 USDC after rehearsals.
- Demo plan grows to dozens of end-to-end transfers in a single session.
- We move to larger per-conversion amounts (for example $5+ defaults).

Re-checking is a one-liner: `npm run fetch-wallets`.

---

## Files changed

| File | Change | Tracked by git? |
|---|---|---|
| `.env` | Restored from local backup. | No (gitignored). |
| `scripts/fetch-wallets.ts` | Added per-wallet balance lookup; new `usdc_balance` + `balances[]` fields; per-wallet error isolation. | Yes. |
| `data/wallets.json` | Regenerated with balances. | No (gitignored). |

Untouched: `scripts/create-wallet.ts`, all wallet addresses, all wallet IDs.

---

## Heads-up identified during this update

**First live payout may need a small code tweak.** Circle reports USDC on
Arc Testnet as the chain's **native token** (`is_native: true`, no
`tokenAddress`). Our `lib/circle.ts` was passing an explicit USDC
`tokenAddress` to `createTransaction`. If the first live demo payout were
triggered as-is, it would likely fail with that mismatch. Addressed in the
next update (see `native-usdc-fix-pm-update.md`).

---

## Status snapshot

**Unblocked**

- Local Next.js dashboard runs end-to-end.
- Attribution → payout pipeline is exercisable.
- PM has a single-command funding check (`npm run fetch-wallets`).

**Open decisions for the PM**

- Confirm vs. ignore the native-USDC `tokenAddress` risk before the first
  live payout (addressed in the next update).
- Plan a credential rotation before any public push (testnet keys still
  live in offline local backup).
- Optional: add `npm run fetch-wallets` to the demo runbook as a
  pre-flight check.

---

_No secrets, API keys, credential material, or recovery-file paths are
reproduced in this document._
