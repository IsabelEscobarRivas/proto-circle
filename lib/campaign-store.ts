// In-memory campaign pool store. Resets on every process restart by design —
// this is the demo-funded pool used by the campaign endpoints, not durable
// state. SQLite (lib/db.ts) remains the source of truth for everything else.
//
// We pin the singleton onto `globalThis` because Next.js dev mode (HMR /
// per-route module graphs) can otherwise instantiate this module more than
// once, which would silently fragment the pool state across routes.

type CampaignState = {
  id: string;
  poolBalance: number;
  approvedCreators: Array<{ id: string; walletAddress: string }>;
  clickPayoutAmount: number;
  conversionPayoutAmount: number;
};

const GLOBAL_KEY = "__protoCircleCampaign__";

function init(): CampaignState {
  // Stable pool identities for the two demo creator wallets. Lets click
  // micropayments succeed after a cold start without /approve (restart-safe).
  return {
    id: "demo-campaign-001",
    poolBalance: 10.0,
    approvedCreators: [
      {
        id: "creator-a",
        walletAddress: "0x74cd72c679248d815249d5269ad8bf07dc265ca6",
      },
      {
        id: "creator-b",
        walletAddress: "0x704d61937c67e39a0d53f4a014066f373a1b0241",
      },
    ],
    clickPayoutAmount: 0.01,
    conversionPayoutAmount: 0.2,
  };
}

const g = globalThis as unknown as Record<string, CampaignState | undefined>;
if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = init();
}

export const campaign: CampaignState = g[GLOBAL_KEY]!;

export function deductFromPool(amount: number): boolean {
  if (campaign.poolBalance < amount) return false;
  campaign.poolBalance -= amount;
  return true;
}

export function addApprovedCreator(id: string, walletAddress: string) {
  const norm = walletAddress.toLowerCase();
  const exists = campaign.approvedCreators.some(
    (c) => c.id === id || c.walletAddress.toLowerCase() === norm,
  );
  if (exists) return;
  campaign.approvedCreators.push({ id, walletAddress });
}
