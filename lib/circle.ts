import {
  initiateDeveloperControlledWalletsClient,
  type TokenBlockchain,
} from "@circle-fin/developer-controlled-wallets";

export const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";

export function getCircleConfig() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  const walletAddress = process.env.CIRCLE_WALLET_ADDRESS;
  const blockchain = (process.env.CIRCLE_WALLET_BLOCKCHAIN ??
    "ARC-TESTNET") as TokenBlockchain;

  const missing: string[] = [];
  if (!apiKey) missing.push("CIRCLE_API_KEY");
  if (!entitySecret) missing.push("CIRCLE_ENTITY_SECRET");
  if (!walletAddress) missing.push("CIRCLE_WALLET_ADDRESS");
  if (missing.length > 0) {
    throw new Error(
      `Missing required Circle env vars: ${missing.join(", ")}. Run \`npm run setup\` or copy .env.example to .env.`,
    );
  }

  return {
    apiKey: apiKey!,
    entitySecret: entitySecret!,
    walletAddress: walletAddress!,
    blockchain,
  };
}

let _client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null =
  null;

export function getCircleClient() {
  if (_client) return _client;
  const { apiKey, entitySecret } = getCircleConfig();
  _client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return _client;
}
