import { nanoid } from "nanoid";
import { getDb, type EventType, type UserEvent } from "@/lib/db";
import {
  badRequest,
  created,
  ok,
  optionalNumber,
  optionalString,
  readJson,
  requireString,
  serverError,
} from "@/lib/http";

const ALLOWED: EventType[] = ["click", "landing", "conversion"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const subject = url.searchParams.get("subject_id");
  const db = getDb();
  const rows = subject
    ? (db
        .prepare(
          "SELECT * FROM user_events WHERE anonymous_user_id = ? ORDER BY occurred_at DESC LIMIT 500",
        )
        .all(subject) as UserEvent[])
    : (db
        .prepare(
          "SELECT * FROM user_events ORDER BY occurred_at DESC LIMIT 500",
        )
        .all() as UserEvent[]);
  return ok({ events: rows });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (e) {
    return badRequest((e as Error).message);
  }

  let anonymous_user_id: string;
  let event_type: string;
  try {
    anonymous_user_id = requireString(body, "anonymous_user_id");
    event_type = requireString(body, "event_type");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  if (!ALLOWED.includes(event_type as EventType)) {
    return badRequest(
      `event_type must be one of: ${ALLOWED.join(", ")}.`,
    );
  }

  let campaign_link_id: string | undefined;
  let amount_usd: number | undefined;
  let occurred_at_iso: string | undefined;
  let metadata: unknown;
  try {
    campaign_link_id = optionalString(body, "campaign_link_id");
    amount_usd = optionalNumber(body, "amount_usd");
    occurred_at_iso = optionalString(body, "occurred_at");
    metadata = body["metadata"];
  } catch (e) {
    return badRequest((e as Error).message);
  }

  // Click and landing events require a campaign link; conversions may omit it.
  if (
    (event_type === "click" || event_type === "landing") &&
    !campaign_link_id
  ) {
    return badRequest(
      `campaign_link_id is required for ${event_type} events.`,
    );
  }

  const occurredAt = occurred_at_iso
    ? Date.parse(occurred_at_iso)
    : Date.now();
  if (Number.isNaN(occurredAt)) {
    return badRequest("occurred_at must be an ISO 8601 timestamp.");
  }

  const db = getDb();
  if (campaign_link_id) {
    const linkExists = db
      .prepare("SELECT 1 FROM campaign_links WHERE id = ?")
      .get(campaign_link_id);
    if (!linkExists) {
      return badRequest(`campaign_link_id ${campaign_link_id} not found.`);
    }
  }

  // Exact-duplicate safeguard: same subject + link + type + occurred_at is
  // dropped silently (returns existing event).
  const dup = db
    .prepare(
      `SELECT * FROM user_events
         WHERE anonymous_user_id = ? AND event_type = ?
           AND COALESCE(campaign_link_id, '') = COALESCE(?, '')
           AND occurred_at = ?`,
    )
    .get(
      anonymous_user_id,
      event_type,
      campaign_link_id ?? null,
      occurredAt,
    ) as UserEvent | undefined;
  if (dup) {
    return ok({ event: dup, deduped: true });
  }

  const event: UserEvent = {
    id: nanoid(12),
    anonymous_user_id,
    campaign_link_id: campaign_link_id ?? null,
    event_type: event_type as EventType,
    amount_usd: amount_usd ?? null,
    occurred_at: occurredAt,
    metadata_json: metadata === undefined ? null : JSON.stringify(metadata),
  };

  try {
    db.prepare(
      `INSERT INTO user_events
         (id, anonymous_user_id, campaign_link_id, event_type, amount_usd, occurred_at, metadata_json)
         VALUES (@id, @anonymous_user_id, @campaign_link_id, @event_type, @amount_usd, @occurred_at, @metadata_json)`,
    ).run(event);
  } catch (e) {
    return serverError("Failed to record event.", (e as Error).message);
  }

  return created({ event });
}
