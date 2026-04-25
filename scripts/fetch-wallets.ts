/**
 * scripts/fetch-wallets.ts
 *
 * Fetch all wallets from Circle's developer-controlled-wallets API and
 * persist a compact summary (id, address, blockchain, balances) to
 * data/wallets.json.
 *
 * Read-only: this script does NOT create wallets and does NOT mutate .env.
 *
 * Usage:
 *   npm run fetch-wallets
 *   # or directly:
 *   node --env-file=.env --import=tsx scripts/fetch-wallets.ts
 *
 * Required environment:
 *   CIRCLE_API_KEY   — test or live Circle API key.
 * Optional:
 *   CIRCLE_API_BASE  — overrides the default https://api.circle.com.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data", "wallets.json");
const API_BASE = process.env.CIRCLE_API_BASE ?? "https://api.circle.com";
const PAGE_SIZE = 50;
const MAX_PAGES = 20;

type CircleWallet = {
  id: string;
  address: string;
  blockchain: string;
  [key: string]: unknown;
};

type ListResponse = {
  data?: { wallets?: CircleWallet[] };
  message?: string;
  code?: number;
};

type CircleToken = {
  id?: string;
  blockchain?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  isNative?: boolean;
  name?: string;
};

type CircleTokenBalance = {
  token?: CircleToken;
  amount?: string;
  updateDate?: string;
};

type BalancesResponse = {
  data?: { tokenBalances?: CircleTokenBalance[] };
  message?: string;
  code?: number;
};

type TokenBalanceOut = {
  symbol: string | null;
  amount: string;
  token_address: string | null;
  is_native: boolean;
};

type CompactWallet = {
  id: string;
  address: string;
  blockchain: string;
  usdc_balance: string | null;
  balances: TokenBalanceOut[];
  balances_error?: string;
};

async function circleGet<T>(apiKey: string, pathAndQuery: string): Promise<T> {
  const url = new URL(pathAndQuery, API_BASE);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw new Error(
      `Network error contacting Circle (${url.toString()}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const bodyText = await res.text();
  if (!res.ok) {
    let message = bodyText;
    try {
      const parsed = JSON.parse(bodyText) as { message?: string };
      if (parsed?.message) message = parsed.message;
    } catch {
      // fall back to raw text
    }
    throw new Error(
      `Circle API error ${res.status} ${res.statusText} on ${url.pathname}: ${
        message || "no body"
      }`,
    );
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new Error(
      `Circle API returned non-JSON response on ${url.pathname}: ${bodyText.slice(0, 200)}`,
    );
  }
}

async function fetchPage(
  apiKey: string,
  pageAfter?: string,
): Promise<CircleWallet[]> {
  const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
  if (pageAfter) qs.set("pageAfter", pageAfter);
  const body = await circleGet<ListResponse>(
    apiKey,
    `/v1/w3s/wallets?${qs.toString()}`,
  );
  return body.data?.wallets ?? [];
}

async function fetchBalances(
  apiKey: string,
  walletId: string,
): Promise<CircleTokenBalance[]> {
  const body = await circleGet<BalancesResponse>(
    apiKey,
    `/v1/w3s/wallets/${encodeURIComponent(walletId)}/balances`,
  );
  return body.data?.tokenBalances ?? [];
}

function pickUsdc(balances: CircleTokenBalance[]): string | null {
  const usdc = balances.find(
    (b) => (b.token?.symbol ?? "").toUpperCase() === "USDC",
  );
  return usdc?.amount ?? null;
}

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CIRCLE_API_KEY is not set. Make sure .env exists and you launched with --env-file=.env (or `npm run fetch-wallets`).",
    );
  }

  console.log("Fetching wallets from Circle…");

  const all: CircleWallet[] = [];
  let cursor: string | undefined;
  let pageCount = 0;
  while (pageCount < MAX_PAGES) {
    pageCount++;
    const page = await fetchPage(apiKey, cursor);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    const last = page[page.length - 1];
    if (!last?.id) break;
    cursor = last.id;
  }
  if (pageCount >= MAX_PAGES) {
    console.warn(
      `Pagination cap reached at ${MAX_PAGES} pages (${all.length} wallets so far).`,
    );
  }

  console.log(
    `Fetched ${all.length} wallet(s) in ${pageCount} page(s). Looking up balances…`,
  );

  // Fetch balances sequentially to stay gentle on Circle's rate limits and
  // keep error messages attributable. The wallet list is small for this
  // prototype; parallelism is not worth the added complexity.
  const compact: CompactWallet[] = [];
  for (const w of all) {
    try {
      const raw = await fetchBalances(apiKey, w.id);
      const balances: TokenBalanceOut[] = raw.map((b) => ({
        symbol: b.token?.symbol ?? null,
        amount: b.amount ?? "0",
        token_address: b.token?.tokenAddress ?? null,
        is_native: Boolean(b.token?.isNative),
      }));
      compact.push({
        id: w.id,
        address: w.address,
        blockchain: w.blockchain,
        usdc_balance: pickUsdc(raw),
        balances,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ! balance fetch failed for ${w.id}: ${message}`);
      compact.push({
        id: w.id,
        address: w.address,
        blockchain: w.blockchain,
        usdc_balance: null,
        balances: [],
        balances_error: message,
      });
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ wallets: compact }, null, 2) + "\n",
    "utf-8",
  );

  const relPath = path.relative(process.cwd(), OUTPUT_PATH);
  console.log("");
  for (const w of compact) {
    const usdc =
      w.usdc_balance !== null ? `${w.usdc_balance} USDC` : "no USDC balance";
    console.log(`  [${w.blockchain}] ${w.address}  (id=${w.id})`);
    console.log(`    ${usdc}`);
  }
  console.log("");
  console.log(`Saved to ${relPath}`);
}

main().catch((err) => {
  console.error(
    "Error:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
