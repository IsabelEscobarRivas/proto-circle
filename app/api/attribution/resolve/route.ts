import {
  badRequest,
  created,
  optionalNumber,
  optionalString,
  readJson,
  requireString,
  serverError,
} from "@/lib/http";
import {
  resolveAttribution,
  type AttributionRationale,
} from "@/lib/attribution";
import type { AttributionMethod } from "@/lib/db";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (e) {
    return badRequest((e as Error).message);
  }

  let subject_id: string;
  try {
    subject_id = requireString(body, "subject_id");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  let methodStr: string | undefined;
  let conversion_event_id: string | undefined;
  let amount_usd: number | undefined;
  let lookback_days: number | undefined;
  try {
    methodStr = optionalString(body, "method");
    conversion_event_id = optionalString(body, "conversion_event_id");
    amount_usd = optionalNumber(body, "amount_usd");
    lookback_days = optionalNumber(body, "lookback_days");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  const method: AttributionMethod | undefined =
    methodStr === "recency_weighted" || methodStr === "last_click"
      ? methodStr
      : methodStr
        ? undefined
        : undefined;
  if (methodStr && !method) {
    return badRequest(
      "method must be one of: recency_weighted, last_click.",
    );
  }

  try {
    const result = resolveAttribution({
      subject_id,
      method,
      conversion_event_id,
      amount_usd,
      lookback_days,
    });
    const rationale: AttributionRationale = JSON.parse(
      result.decision.rationale_json,
    );
    return created({
      decision: result.decision,
      shares: result.shares,
      rationale,
    });
  } catch (e) {
    return serverError(
      "Attribution resolution failed.",
      (e as Error).message,
    );
  }
}
