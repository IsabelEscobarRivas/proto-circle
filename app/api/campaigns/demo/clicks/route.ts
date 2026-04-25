import { NextResponse } from "next/server";
import { badRequest, readJson, requireString } from "@/lib/http";
import { campaign, deductFromPool } from "@/lib/campaign-store";
import { sendUsdc } from "@/lib/payout";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (e) {
    return badRequest((e as Error).message);
  }

  let creatorId: string;
  let linkId: string;
  try {
    creatorId = requireString(body, "creatorId");
    linkId = requireString(body, "linkId");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  const creator = campaign.approvedCreators.find((c) => c.id === creatorId);
  if (!creator) {
    return NextResponse.json(
      { error: "creator not approved" },
      { status: 403 },
    );
  }

  if (!deductFromPool(campaign.clickPayoutAmount)) {
    return NextResponse.json(
      {
        error: "insufficient pool balance",
        poolBalance: campaign.poolBalance,
      },
      { status: 402 },
    );
  }

  try {
    const { circleTxId } = await sendUsdc(
      creator.walletAddress,
      campaign.clickPayoutAmount,
    );
    return NextResponse.json({
      status: "initiated",
      amount: campaign.clickPayoutAmount,
      circleTxId,
      poolBalance: campaign.poolBalance,
      linkId,
    });
  } catch (e) {
    // Refund the pool: deduction must not stick if Circle rejects synchronously.
    campaign.poolBalance += campaign.clickPayoutAmount;
    return NextResponse.json(
      {
        error: "circle rejected transaction",
        details: (e as Error).message,
        poolBalance: campaign.poolBalance,
      },
      { status: 502 },
    );
  }
}
