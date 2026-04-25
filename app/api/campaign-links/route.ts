import { nanoid } from "nanoid";
import { getDb, type CampaignLink } from "@/lib/db";
import {
  badRequest,
  created,
  ok,
  readJson,
  requireString,
  serverError,
} from "@/lib/http";

type LinkWithInfluencer = CampaignLink & {
  influencer_display_name: string;
  influencer_wallet: string;
};

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*, i.display_name AS influencer_display_name, i.wallet_address AS influencer_wallet
         FROM campaign_links c
         JOIN influencers i ON i.id = c.influencer_id
         ORDER BY c.created_at DESC`,
    )
    .all() as LinkWithInfluencer[];

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const links = rows.map((r) => ({
    ...r,
    tracking_url: `${baseUrl}/r/${r.id}`,
  }));
  return ok({ links });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (e) {
    return badRequest((e as Error).message);
  }

  let influencer_id: string;
  let merchant_domain: string;
  let target_url: string;
  try {
    influencer_id = requireString(body, "influencer_id");
    merchant_domain = requireString(body, "merchant_domain");
    target_url = requireString(body, "target_url");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  try {
    // Validate URL parses.
    new URL(target_url);
  } catch {
    return badRequest("target_url must be a valid absolute URL.");
  }

  const db = getDb();
  const exists = db
    .prepare("SELECT 1 FROM influencers WHERE id = ?")
    .get(influencer_id);
  if (!exists) {
    return badRequest(`Influencer ${influencer_id} does not exist.`);
  }

  // 8-char nanoid gives ~1.7T combinations — plenty for a hackathon demo.
  const link: CampaignLink = {
    id: nanoid(8),
    influencer_id,
    merchant_domain,
    target_url,
    created_at: Date.now(),
  };

  try {
    db.prepare(
      `INSERT INTO campaign_links (id, influencer_id, merchant_domain, target_url, created_at)
         VALUES (@id, @influencer_id, @merchant_domain, @target_url, @created_at)`,
    ).run(link);
  } catch (e) {
    return serverError(
      "Failed to create campaign link.",
      (e as Error).message,
    );
  }

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return created({ link: { ...link, tracking_url: `${baseUrl}/r/${link.id}` } });
}
