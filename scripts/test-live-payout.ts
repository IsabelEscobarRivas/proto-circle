/**
 * scripts/test-live-payout.ts
 *
 * One-shot, PM-authorized live payout test on Arc Testnet.
 *
 * - Executes EXACTLY ONE transaction via the existing payout path
 *   (lib/payout.ts#sendUsdc — same code used by POST /api/payouts).
 * - Does not modify any application code.
 * - Hard-codes the PM-approved parameters so the script cannot be
 *   accidentally reused for a different amount or recipient.
 *
 * Run:
 *   npm run test-live-payout
 */

import { sendUsdc, getPayoutStatus, explorerUrl } from "../lib/payout";

// PM-approved parameters (Apr 22, 2026). Hard-coded on purpose.
const RECIPIENT = "0x74cd72c679248d815249d5269ad8bf07dc265ca6";
const AMOUNT_USD = 0.10;

// Circle Arc Testnet transactions typically reach COMPLETE within 5–30s.
const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 180_000;

function ts(startedAt: number): string {
  return `+${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

async function main() {
  console.log("=== Live payout test (PM-approved, single transaction) ===");
  console.log(`  From:      (platform wallet, from .env CIRCLE_WALLET_ADDRESS)`);
  console.log(`  To:        ${RECIPIENT}`);
  console.log(`  Amount:    ${AMOUNT_USD} USDC`);
  console.log(`  Network:   ARC-TESTNET (native USDC)`);
  console.log("");

  const startedAt = Date.now();

  console.log(`[${ts(startedAt)}] Calling sendUsdc()…`);
  const { circleTxId, initialState } = await sendUsdc(RECIPIENT, AMOUNT_USD);
  console.log(`[${ts(startedAt)}] Transaction accepted by Circle.`);
  console.log(`  circleTxId:    ${circleTxId}`);
  console.log(`  initialState:  ${initialState ?? "<not returned>"}`);
  console.log("");

  let last: string | undefined = initialState;
  let final: Awaited<ReturnType<typeof getPayoutStatus>> | null = null;
  let pollCount = 0;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    pollCount++;
    const status = await getPayoutStatus(circleTxId);
    const transitioned = status.state !== last;
    if (transitioned) {
      const extras: string[] = [];
      if (status.txHash) extras.push(`txHash=${status.txHash}`);
      if (status.error) extras.push(`error=${status.error}`);
      const tail = extras.length ? `  (${extras.join(", ")})` : "";
      console.log(
        `[${ts(startedAt)}] state: ${last ?? "<unknown>"} → ${
          status.state ?? "<unknown>"
        }${tail}`,
      );
      last = status.state;
    }
    if (status.terminal) {
      final = status;
      break;
    }
  }

  console.log("");
  if (!final) {
    console.error(
      `TIMEOUT after ${TIMEOUT_MS / 1000}s (${pollCount} polls). Last state: ${
        last ?? "<unknown>"
      }. Circle tx ${circleTxId} may still settle — check dashboard.`,
    );
    process.exit(2);
  }

  console.log("=== Terminal state ===");
  console.log(`  state:         ${final.state ?? "<unknown>"}`);
  if (final.txHash) {
    console.log(`  txHash:        ${final.txHash}`);
    console.log(`  explorer:      ${explorerUrl(final.txHash)}`);
  } else {
    console.log(`  txHash:        <not returned>`);
  }
  if (final.error) {
    console.log(`  errorReason:   ${final.error}`);
  }
  console.log(`  elapsed:       ${ts(startedAt)}`);

  if (final.state !== "COMPLETE") {
    process.exit(3);
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
