import { NextResponse } from "next/server";
import { campaign } from "@/lib/campaign-store";

export async function GET() {
  return NextResponse.json({
    id: campaign.id,
    poolBalance: campaign.poolBalance,
    approvedCreators: campaign.approvedCreators,
    clickPayoutAmount: campaign.clickPayoutAmount,
    conversionPayoutAmount: campaign.conversionPayoutAmount,
  });
}
