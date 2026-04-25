import { NextResponse } from "next/server";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

export async function GET() {
  try {
    const apiKey = process.env.CIRCLE_API_KEY;
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
    const walletId = process.env.CIRCLE_WALLET_ID;
    if (!apiKey || !entitySecret) {
      return NextResponse.json(
        {
          balance: "0",
          walletAddress: process.env.CIRCLE_WALLET_ADDRESS?.trim() || undefined,
          error: "CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET missing",
        },
        { status: 200 },
      );
    }
    if (!walletId) {
      return NextResponse.json(
        {
          balance: "0",
          walletAddress: process.env.CIRCLE_WALLET_ADDRESS?.trim() || undefined,
          error: "CIRCLE_WALLET_ID not set",
        },
        { status: 200 },
      );
    }

    const client = initiateDeveloperControlledWalletsClient({
      apiKey,
      entitySecret,
    });

    const result = await client.getWalletTokenBalance({ id: walletId });
    const balances = result.data?.tokenBalances ?? [];

    const usdc = balances.find(
      (b) => b.token?.symbol === "USDC" || b.token?.symbol === "USDC-testnet",
    );

    const amount = usdc?.amount ?? "0";

    const walletAddress = process.env.CIRCLE_WALLET_ADDRESS?.trim() || undefined;
    return NextResponse.json({ balance: amount, walletAddress });
  } catch (e) {
    return NextResponse.json(
      {
        balance: "0",
        walletAddress: process.env.CIRCLE_WALLET_ADDRESS?.trim() || undefined,
        error: (e as Error).message,
      },
      { status: 200 },
    );
  }
}
