/**
 * scripts/provision-creator-wallet.ts
 *
 * Create ONE additional developer-controlled wallet in the existing wallet
 * set on Arc Testnet, to satisfy the demo policy that creators must have
 * distinct, non-platform wallet addresses.
 *
 * This script does NOT:
 *   - create a new wallet set
 *   - register a new entity secret
 *   - modify .env
 *   - send any funds
 *   - touch the application code or DB
 *
 * It only calls `client.createWallets({ walletSetId, ... })` on the wallet
 * set discovered from the existing `GET /v1/w3s/wallets` response. If the
 * Circle account has more than one wallet set, the script refuses to act
 * rather than guess.
 *
 * Usage:
 *   npm run provision-creator-wallet
 *   # or directly:
 *   node --env-file=.env --import=tsx scripts/provision-creator-wallet.ts
 *
 * Required environment:
 *   CIRCLE_API_KEY         — same testnet key used by the rest of the app
 *   CIRCLE_ENTITY_SECRET   — the entity secret registered on first setup
 * Optional:
 *   CIRCLE_API_BASE        — overrides the default https://api.circle.com
 *   BLOCKCHAIN             — defaults to ARC-TESTNET
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const API_BASE = process.env.CIRCLE_API_BASE ?? "https://api.circle.com";
const BLOCKCHAIN = (process.env.BLOCKCHAIN ?? "ARC-TESTNET") as "ARC-TESTNET";

type CircleWalletListItem = {
  id: string;
  address: string;
  blockchain: string;
  walletSetId?: string;
};

type ListResponse = {
  data?: { wallets?: CircleWalletListItem[] };
  message?: string;
};

async function listWallets(apiKey: string): Promise<CircleWalletListItem[]> {
  const url = new URL("/v1/w3s/wallets?pageSize=50", API_BASE);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Circle list-wallets failed: ${res.status} ${res.statusText} — ${bodyText.slice(0, 200)}`,
    );
  }
  const body = JSON.parse(bodyText) as ListResponse;
  return body.data?.wallets ?? [];
}

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey) {
    throw new Error(
      "CIRCLE_API_KEY is required. Make sure .env exists and you launched with `npm run provision-creator-wallet`.",
    );
  }
  if (!entitySecret) {
    throw new Error(
      "CIRCLE_ENTITY_SECRET is required. It should already be in .env from the initial setup.",
    );
  }

  console.log("Looking up existing wallet set…");
  const wallets = await listWallets(apiKey);
  if (wallets.length === 0) {
    throw new Error(
      "No wallets exist yet. Run `scripts/create-wallet.ts` first to set up the wallet set.",
    );
  }
  const setIds = Array.from(
    new Set(wallets.map((w) => w.walletSetId).filter((v): v is string => Boolean(v))),
  );
  if (setIds.length !== 1) {
    throw new Error(
      `Ambiguous wallet set: ${setIds.length === 0 ? "no walletSetId on existing wallets" : `found ${setIds.length} distinct sets (${setIds.join(", ")})`}. Refusing to pick one.`,
    );
  }
  const walletSetId = setIds[0]!;
  console.log(
    `  wallet set: ${walletSetId}  (${wallets.length} existing wallet(s))`,
  );

  console.log(`\nCreating 1 wallet on ${BLOCKCHAIN}…`);
  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  const response = await client.createWallets({
    walletSetId,
    blockchains: [BLOCKCHAIN],
    count: 1,
    accountType: "EOA",
  });
  const wallet = response.data?.wallets?.[0];
  if (!wallet) {
    throw new Error("Wallet creation returned no wallet.");
  }

  console.log("\nNew wallet provisioned:");
  console.log(`  id         : ${wallet.id}`);
  console.log(`  address    : ${wallet.address}`);
  console.log(`  blockchain : ${wallet.blockchain}`);

  console.log("\nNext steps:");
  console.log("  1. Run `npm run fetch-wallets` to refresh data/wallets.json.");
  console.log(
    "  2. Update the demo page constants (creator B address) in app/demo/page.tsx.",
  );
  console.log(
    "  3. This wallet starts with 0 USDC. It only needs funding if it will *send* payouts;",
  );
  console.log(
    "     it does not need funding to *receive* them. The demo only uses it as a receiver.",
  );
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
