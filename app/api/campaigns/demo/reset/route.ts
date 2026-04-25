import { NextResponse } from "next/server";
import { badRequest, readJson } from "@/lib/http";
import { campaign, setPoolBalance } from "@/lib/campaign-store";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (e) {
    return badRequest((e as Error).message);
  }

  const balance = body["balance"];
  if (
    typeof balance !== "number" ||
    !Number.isFinite(balance) ||
    balance < 0
  ) {
    return badRequest("balance must be a non-negative finite number");
  }

  setPoolBalance(balance);
  return NextResponse.json({ poolBalance: campaign.poolBalance });
}
