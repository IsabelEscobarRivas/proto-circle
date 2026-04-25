import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getDb, type CampaignLink, type UserEvent } from "@/lib/db";

const COOKIE_NAME = "visitor_uid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const db = getDb();
  const link = db
    .prepare("SELECT * FROM campaign_links WHERE id = ?")
    .get(code) as CampaignLink | undefined;

  if (!link) {
    return new NextResponse(`Unknown campaign link: ${code}`, { status: 404 });
  }

  // Resolve or mint anonymous_user_id (cookie-based).
  const cookieHeader = req.headers.get("cookie") ?? "";
  const existing = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  const anonymousUserId = existing
    ? decodeURIComponent(existing.slice(COOKIE_NAME.length + 1))
    : `anon_${nanoid(16)}`;

  const event: UserEvent = {
    id: nanoid(12),
    anonymous_user_id: anonymousUserId,
    campaign_link_id: link.id,
    event_type: "click",
    amount_usd: null,
    occurred_at: Date.now(),
    metadata_json: JSON.stringify({
      user_agent: req.headers.get("user-agent") ?? null,
      referer: req.headers.get("referer") ?? null,
    }),
  };

  try {
    db.prepare(
      `INSERT INTO user_events
         (id, anonymous_user_id, campaign_link_id, event_type, amount_usd, occurred_at, metadata_json)
         VALUES (@id, @anonymous_user_id, @campaign_link_id, @event_type, @amount_usd, @occurred_at, @metadata_json)`,
    ).run(event);
  } catch (e) {
    console.error("Failed to log click event:", e);
    // Don't block redirect on logging failure.
  }

  const response = NextResponse.redirect(link.target_url, { status: 302 });
  if (!existing) {
    response.cookies.set(COOKIE_NAME, anonymousUserId, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: false, // allow client JS to read it for demo conversion triggers
      sameSite: "lax",
      path: "/",
    });
  }
  return response;
}
