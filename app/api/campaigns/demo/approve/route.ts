import { NextResponse } from "next/server";
import { badRequest, readJson, requireString } from "@/lib/http";
import { addApprovedCreator, campaign } from "@/lib/campaign-store";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (e) {
    return badRequest((e as Error).message);
  }

  let id: string;
  let walletAddress: string;
  try {
    id = requireString(body, "id");
    walletAddress = requireString(body, "walletAddress");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    return badRequest("walletAddress must be a 0x-prefixed 40-char hex string.");
  }

  addApprovedCreator(id, walletAddress);
  return NextResponse.json({
    approvedCreators: campaign.approvedCreators,
  });
}
