# Wallet Inventory & Implications — PM Briefing

**Date:** Apr 22, 2026
**Status:** Wallets confirmed · One env-config issue flagged
**Source:** Live read of Circle `GET /v1/w3s/wallets` via `scripts/fetch-wallets.ts`
**Output file:** `data/wallets.json` (gitignored)
**Network:** Arc Testnet

---

## Headline

Confirmed exactly which on-chain accounts the prototype owns, all on Arc
Testnet, with no new wallets created and no changes to credentials. Surfaced
one environment issue (`.env` missing locally) that was blocking end-to-end
demo runs.

| Metric | Value |
|---|---|
| Wallets owned by the project | 2 |
| Blockchains in use | 1 (ARC-TESTNET) |
| New wallets created by this check | 0 |
| Environment issue found | 1 |

---

## Wallets owned by this project

| Role | Address | Wallet ID | Chain |
|---|---|---|---|
| **Platform payout wallet** | `0x9919d90b8debbfa5d126aad522935966b2deac3a` | `832d735a-7f03-5fe9-8830-a12ba3a5d586` | ARC-TESTNET |
| Test recipient wallet | `0x74cd72c679248d815249d5269ad8bf07dc265ca6` | `3f5ca791-c41e-53d9-a2be-dc50f2b50dce` | ARC-TESTNET |

Both were provisioned during the initial Circle prototype on Apr 19 and are
the same ones referenced by the existing scripts and the dashboard.

---

## What this confirms

- The Circle account is reachable and the prototype is not depending on any
  wallet that lives outside this project.
- All on-chain activity is on Arc Testnet only — no mainnet exposure, no
  real-money risk for the demo.
- The platform payout wallet referenced by `lib/circle.ts` and the
  dashboard exists in Circle and is owned by us.
- The fetch script is strictly read-only: zero new wallets created, zero
  writes to Circle, zero changes to `.env`.

---

## Issue for the PM

**`.env` was missing locally — blocked the demo.**
The Next.js dashboard, `scripts/create-wallet.ts`, and the payout service
all read from `.env`. Cause: the testnet credentials were purged from git
history during the security cleanup; the working-tree copy was removed in
the same operation.

**Decision needed at the time:** restore the existing testnet `.env` (fast)
or rotate to fresh credentials before restoring (cleaner). Resolved in the
follow-up update (see `env-restoration-pm-update.md`).

## Scope item (not a blocker)

**No balance information yet.** The first version of the fetch script only
persisted `id`, `address`, and `blockchain`. So we could not confirm the
platform wallet had enough USDC to fund the demo. Mitigation: a small
extension to the fetch script could add balances. Delivered in the
follow-up update.

---

## Risks & decisions

| Item | Type | Owner | Recommendation |
|---|---|---|---|
| Restore vs. rotate testnet credentials | Decision | PM + dev | Restore now to unblock demo; rotate before any public push. |
| Fund platform wallet with testnet USDC | Action | Dev | Verify balance once `.env` is back; top up via faucet if low. |
| Add wallet-balance read to fetch script | Enhancement | Dev | Small follow-up; gives PM a one-glance funding check. |
| Treat `data/wallets.json` as canonical | Convention | Dev | Document in `AGENTS.md` so future contributors trust it. |
| Wallets are testnet-only | Risk control | PM | Explicitly call out in demo narrative; no mainnet path exists yet. |

---

## Recommended next steps (from this briefing)

1. Restore `.env` (testnet only) to unblock the dashboard, payouts, and the
   rest of the build.
2. Confirm the platform wallet's USDC balance on Arc Testnet; top up from
   the Circle faucet if needed for the demo.
3. Extend `fetch-wallets` to include a balance column so the PM has a
   one-shot funding check.
4. Plan a credential rotation before any public push or hackathon
   submission, even though the keys are testnet.

---

_No secrets, API keys, or credential material are reproduced in this
document. Wallet addresses and IDs shown here are public on-chain
identifiers._
