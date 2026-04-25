import { getCircleClient, getCircleConfig } from "./circle";

// Per Circle's SDK contract (TokenAddressAndBlockchainInput), `tokenAddress`
// must be empty for native tokens. On Arc Testnet, USDC is reported as the
// chain's native token (is_native: true, no tokenAddress in the balances
// payload), so we omit the address when initiating transfers.
const NATIVE_TOKEN_ADDRESS = "";

export type PayoutInitiation = {
  circleTxId: string;
  initialState: string | undefined;
};

/**
 * Initiates a USDC transfer from the platform payout wallet to `recipientAddress`.
 * Returns the Circle transaction ID and initial state; caller is responsible
 * for polling `getPayoutStatus` to observe state transitions.
 */
export async function sendUsdc(
  recipientAddress: string,
  amountUsd: number,
): Promise<PayoutInitiation> {
  const { walletAddress, blockchain } = getCircleConfig();
  const client = getCircleClient();

  // Circle expects amount as a string array with up to 6 decimal places for USDC.
  const amountStr = amountUsd.toFixed(6).replace(/\.?0+$/, "");

  const response = await client.createTransaction({
    blockchain,
    walletAddress,
    destinationAddress: recipientAddress,
    amount: [amountStr],
    tokenAddress: NATIVE_TOKEN_ADDRESS,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const id = response.data?.id;
  if (!id) throw new Error("Circle did not return a transaction ID.");

  return { circleTxId: id, initialState: response.data?.state };
}

export type PayoutStatusResult = {
  state: string | undefined;
  txHash: string | undefined;
  terminal: boolean;
  error: string | undefined;
};

const TERMINAL_STATES = new Set([
  "COMPLETE",
  "FAILED",
  "CANCELLED",
  "DENIED",
]);

export async function getPayoutStatus(
  circleTxId: string,
): Promise<PayoutStatusResult> {
  const client = getCircleClient();
  const response = await client.getTransaction({ id: circleTxId });
  const tx = response.data?.transaction;
  const state = tx?.state;
  return {
    state,
    txHash: tx?.txHash,
    terminal: state ? TERMINAL_STATES.has(state) : false,
    error: tx?.errorReason ?? undefined,
  };
}

export function explorerUrl(txHash: string): string {
  return `https://testnet.arcscan.app/tx/${txHash}`;
}
