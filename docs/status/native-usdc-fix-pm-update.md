# Native USDC Transaction Fix — PM Update

**Date:** Apr 22, 2026
**Status:** Fix applied · No live payout run
**Scope:** Minimal (one file changed)
**Working name:** Instant Attribution & Micropayments Engine

---

## Headline

Native-USDC transaction risk removed ahead of the first live payout test.
Single file changed (`lib/payout.ts`), zero wallets / `.env` / IDs touched,
no live transaction triggered. Awaiting PM go-ahead for a small isolated
live test before the first full pipeline run.

| Metric | Value |
|---|---|
| `tokenAddress` was being passed | Yes |
| Files changed | 1 |
| Wallets / `.env` / IDs touched | 0 |
| TypeScript + lint | Pass |

---

## Was `tokenAddress` being passed?

Yes, in two places. Only the runtime path was fixed; the setup script was
deliberately left alone per the PM constraint.

| Location | What it was passing | Status |
|---|---|---|
| `lib/payout.ts` (runtime payout path) | `tokenAddress: ARC_TESTNET_USDC` (placeholder `0x3600…0000`) | **Fixed.** |
| `scripts/create-wallet.ts` (one-shot setup, already ran Apr 19) | `tokenAddress: ARC_TESTNET_USDC` | Untouched per PM constraint. Not invoked at runtime; no live impact. |
| `lib/circle.ts` (constant declaration) | `export const ARC_TESTNET_USDC = "0x3600…0000"` | Left in place — only `create-wallet.ts` references it now. |

The `0x3600…0000` value was a placeholder invented in the original
prototype, not a real token contract. Arc Testnet has no USDC token
contract because **USDC is the chain's native asset**.

---

## The change

One file: `lib/payout.ts`. Two minimal edits.

1. Replaced the misleading import with a documented native-token marker:

   ```ts
   import { getCircleClient, getCircleConfig } from "./circle";

   // Per Circle's SDK contract (TokenAddressAndBlockchainInput),
   // tokenAddress must be empty for native tokens. On Arc Testnet,
   // USDC is reported as the chain's native token (is_native: true,
   // no tokenAddress in the balances payload), so we omit the address
   // when initiating transfers.
   const NATIVE_TOKEN_ADDRESS = "";
   ```

2. Switched the `createTransaction` call to use it:

   ```ts
   const response = await client.createTransaction({
     blockchain,
     walletAddress,
     destinationAddress: recipientAddress,
     amount: [amountStr],
     tokenAddress: NATIVE_TOKEN_ADDRESS,
     fee: { type: "level", config: { feeLevel: "MEDIUM" } },
   });
   ```

---

## Backing for the fix

From the Circle SDK's type definitions (`TokenAddressAndBlockchainInput`):

> *Blockchain address of the transferred token. Empty for native tokens.
> Excluded with `tokenId`.*

Our balances response confirms USDC on Arc Testnet matches this definition:
`is_native: true`, no `tokenAddress`.

---

## How live payout should now behave

1. Dashboard or API caller triggers `POST /api/payouts` → `sendUsdc` →
   Circle `createTransaction` with empty `tokenAddress` + `blockchain:
   ARC-TESTNET`.
2. Circle interprets this as a native USDC transfer.
3. Transaction state progresses
   `INITIATED → QUEUED → SENT → CONFIRMED → COMPLETE`, exactly as the
   dashboard polling code already expects.
4. On confirmation, `txHash` is returned and surfaced as an explorer link
   in the UI.

**Net effect:** the single most likely first-payout failure mode is
removed, without expanding scope.

---

## Verification done

- ESLint: clean.
- `npx tsc --noEmit` (project-wide): passes.
- SDK type discrimination still resolves to the correct branch
  (`TokenAddressAndBlockchainInput`).

---

## Remaining risks before first live payout test

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Circle server-side may prefer the `tokenAddress` field omitted entirely rather than sent as an empty string. | Low–Medium | If the first attempt returns 400, switch to `tokenId` (one-time lookup) — roughly a 5-line follow-up. |
| 2 | `scripts/create-wallet.ts` still references the placeholder `ARC_TESTNET_USDC`. | None at runtime | Setup already ran Apr 19. Re-align before any future setup re-run. |
| 3 | Fee config hardcoded to `feeLevel: MEDIUM`. | Low | Native transfers on Arc Testnet are cheap; MEDIUM is fine for the demo. |
| 4 | Platform wallet balance is ~15 USDC. | Low | Plenty for a small live test. Re-check via `npm run fetch-wallets` immediately before the run. |
| 5 | First live payout has not yet been exercised in this codebase. | Medium | Unavoidable. Recommend a small isolated test transfer first (see below). |
| 6 | `idempotencyKey` is not set on `createTransaction`. | Low | Not relevant for a single-shot demo. Add before any production use. |

---

## Recommended first live test

Pending explicit PM go-ahead. Single $0.10 USDC transfer from the
**platform wallet** (`0x9919d90b…ac3a`) to the **test recipient wallet**
(`0x74cd72c6…65ca6`). Both are project-owned, so this is a fully internal
round trip — no external dependencies, no external addresses to coordinate.

That isolates the SDK-level fix in one transaction. Once `COMPLETE` on the
block explorer, we can confidently exercise the full attribution → payout
pipeline through the dashboard.

**Expected outcome on success:** state `COMPLETE`, platform balance drops
by ~$0.10 (plus negligible gas), test recipient receives $0.10.
`npm run fetch-wallets` confirms both.

---

## Status snapshot

**Done**

- Confirmed and removed the native-USDC risk in `lib/payout.ts`.
- Verified scope: one file changed, lint + `tsc` clean.
- Rationale documented in-code so future agents do not re-introduce the
  bug.

**Awaiting PM decision**

- Green-light the small in-account live test ($0.10, platform → test
  recipient).
- Then proceed with the full attribution → payout pipeline run via the
  dashboard.

---

_No secrets, API keys, credential material, or recovery-file paths are
reproduced in this document. Wallet addresses and IDs shown are public
on-chain identifiers._
