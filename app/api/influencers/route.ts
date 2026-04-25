import { nanoid } from "nanoid";
import { getDb, type Influencer } from "@/lib/db";
import {
  badRequest,
  created,
  ok,
  readJson,
  requireString,
  serverError,
} from "@/lib/http";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM influencers ORDER BY created_at DESC")
    .all() as Influencer[];
  return ok({ influencers: rows });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (e) {
    return badRequest((e as Error).message);
  }

  let display_name: string;
  let wallet_address: string;
  try {
    display_name = requireString(body, "display_name");
    wallet_address = requireString(body, "wallet_address");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
    return badRequest(
      "wallet_address must be a 0x-prefixed 40-character hex string.",
    );
  }

  const db = getDb();
  const influencer: Influencer = {
    id: nanoid(12),
    display_name,
    wallet_address: wallet_address.toLowerCase(),
    status: "active",
    created_at: Date.now(),
  };

  try {
    db.prepare(
      `INSERT INTO influencers (id, display_name, wallet_address, status, created_at)
         VALUES (@id, @display_name, @wallet_address, @status, @created_at)`,
    ).run(influencer);
  } catch (e) {
    return serverError("Failed to create influencer.", (e as Error).message);
  }

  return created({ influencer });
}
