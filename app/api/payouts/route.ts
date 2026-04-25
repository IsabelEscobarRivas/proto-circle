import { NextResponse } from "next/server";
import {
  badRequest,
  created,
  readJson,
  requireString,
  serverError,
} from "@/lib/http";
import { campaign, deductFromPool } from "@/lib/campaign-store";
import { getDb } from "@/lib/db";
import { initiatePayoutsForDecision } from "@/lib/payouts-service";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (e) {
    return badRequest((e as Error).message);
  }

  let decision_id: string;
  try {
    decision_id = requireString(body, "decision_id");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  // Pool deduction must happen before any Circle call. Skip deduction if
  // payouts already exist for this decision (idempotent re-entry from polling).
  const db = getDb();
  const existing = db
    .prepare("SELECT 1 FROM payouts WHERE decision_id = ? LIMIT 1")
    .get(decision_id);

  if (!existing) {
    const totalRow = db
      .prepare(
        "SELECT COALESCE(SUM(amount_usd), 0) AS total FROM attribution_shares WHERE decision_id = ?",
      )
      .get(decision_id) as { total: number };
    const totalPayoutAmount = totalRow.total ?? 0;

    if (totalPayoutAmount > 0 && !deductFromPool(totalPayoutAmount)) {
      return NextResponse.json(
        {
          error: "insufficient pool balance",
          poolBalance: campaign.poolBalance,
          required: totalPayoutAmount,
        },
        { status: 402 },
      );
    }
  }

  try {
    const payouts = await initiatePayoutsForDecision(decision_id);
    return created({ payouts });
  } catch (e) {
    return serverError("Payout initiation failed.", (e as Error).message);
  }
}
