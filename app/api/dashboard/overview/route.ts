import { getDb } from "@/lib/db";
import { ok } from "@/lib/http";

export async function GET() {
  const db = getDb();

  const influencers = db
    .prepare(
      "SELECT id, display_name, wallet_address, status FROM influencers ORDER BY created_at DESC",
    )
    .all();

  const links = db
    .prepare(
      `SELECT c.*, i.display_name AS influencer_display_name
         FROM campaign_links c JOIN influencers i ON i.id = c.influencer_id
         ORDER BY c.created_at DESC`,
    )
    .all();

  const subjects = db
    .prepare(
      `SELECT anonymous_user_id AS subject_id,
              COUNT(*) AS event_count,
              MAX(occurred_at) AS last_event_at
         FROM user_events
         GROUP BY anonymous_user_id
         ORDER BY last_event_at DESC
         LIMIT 50`,
    )
    .all();

  const decisions = db
    .prepare(
      `SELECT d.id, d.subject_id, d.method, d.total_amount_usd, d.created_at,
              (SELECT COUNT(*) FROM attribution_shares s WHERE s.decision_id = d.id) AS share_count,
              (SELECT COUNT(*) FROM payouts p WHERE p.decision_id = d.id) AS payout_count,
              (SELECT COUNT(*) FROM payouts p WHERE p.decision_id = d.id AND p.status = 'complete') AS payout_complete_count
         FROM attribution_decisions d
         ORDER BY d.created_at DESC
         LIMIT 50`,
    )
    .all();

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  return ok({
    influencers,
    links: (links as Array<{ id: string }>).map((l) => ({
      ...l,
      tracking_url: `${baseUrl}/r/${l.id}`,
    })),
    subjects,
    decisions,
  });
}
