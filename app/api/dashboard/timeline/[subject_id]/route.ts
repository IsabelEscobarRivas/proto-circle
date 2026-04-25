import { getDb, type UserEvent } from "@/lib/db";
import { ok } from "@/lib/http";

type TimelineEvent = UserEvent & {
  influencer_id: string | null;
  influencer_display_name: string | null;
  merchant_domain: string | null;
  target_url: string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ subject_id: string }> },
) {
  const { subject_id } = await params;
  const db = getDb();

  const events = db
    .prepare(
      `SELECT e.*,
              i.id AS influencer_id,
              i.display_name AS influencer_display_name,
              c.merchant_domain AS merchant_domain,
              c.target_url AS target_url
         FROM user_events e
         LEFT JOIN campaign_links c ON c.id = e.campaign_link_id
         LEFT JOIN influencers i ON i.id = c.influencer_id
         WHERE e.anonymous_user_id = ?
         ORDER BY e.occurred_at ASC`,
    )
    .all(subject_id) as TimelineEvent[];

  const decisions = db
    .prepare(
      `SELECT id, method, total_amount_usd, window_start, window_end,
              conversion_event_id, created_at
         FROM attribution_decisions
         WHERE subject_id = ?
         ORDER BY created_at DESC`,
    )
    .all(subject_id);

  return ok({ subject_id, events, decisions });
}
