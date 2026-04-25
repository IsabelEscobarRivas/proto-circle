import { nanoid } from "nanoid";
import {
  getDb,
  type AttributionDecision,
  type AttributionMethod,
  type AttributionShare,
  type UserEvent,
} from "./db";

const DEFAULT_WINDOW_DAYS = Number(process.env.ATTRIBUTION_WINDOW_DAYS ?? 7);

type EligibleClick = {
  event_id: string;
  influencer_id: string;
  influencer_display_name: string;
  campaign_link_id: string;
  occurred_at: number;
  age_hours: number;
  raw_weight: number;
};

type PerInfluencer = {
  influencer_id: string;
  display_name: string;
  wallet_address: string;
  summed_weight: number;
  normalized_weight: number;
  amount_usd: number;
};

export type AttributionRationale = {
  method: AttributionMethod;
  lookback_days: number;
  conversion_event_id: string | null;
  conversion_amount_usd: number;
  window_start: number;
  window_end: number;
  eligible_clicks: EligibleClick[];
  per_influencer: PerInfluencer[];
  notes: string[];
};

export type ResolveOptions = {
  subject_id: string;
  method?: AttributionMethod;
  /** Explicit conversion event ID; if omitted, the most recent conversion for the subject is used. */
  conversion_event_id?: string;
  /** Override total amount to split (USD). Defaults to the conversion event's amount, or `DEFAULT_CONVERSION_USD`. */
  amount_usd?: number;
  /** Override lookback window (days). */
  lookback_days?: number;
  /** Override now (unix ms) — useful for deterministic tests and demo replays. */
  now?: number;
};

export type ResolveResult = {
  decision: AttributionDecision;
  shares: AttributionShare[];
  rationale: AttributionRationale;
};

/**
 * Resolve attribution for a subject's qualifying conversion event, persist
 * the decision + per-influencer shares, and return everything (plus the
 * human-readable rationale) for display.
 */
export function resolveAttribution(opts: ResolveOptions): ResolveResult {
  const db = getDb();
  const method: AttributionMethod = opts.method ?? "recency_weighted";
  const lookbackDays = opts.lookback_days ?? DEFAULT_WINDOW_DAYS;
  const now = opts.now ?? Date.now();
  const notes: string[] = [];

  // Locate the conversion event (explicit or most recent).
  let conversion: UserEvent | null = null;
  if (opts.conversion_event_id) {
    conversion = (db
      .prepare("SELECT * FROM user_events WHERE id = ? AND event_type = 'conversion'")
      .get(opts.conversion_event_id) as UserEvent | undefined) ?? null;
    if (!conversion) {
      throw new Error(
        `Conversion event ${opts.conversion_event_id} not found.`,
      );
    }
  } else {
    conversion = (db
      .prepare(
        "SELECT * FROM user_events WHERE anonymous_user_id = ? AND event_type = 'conversion' ORDER BY occurred_at DESC LIMIT 1",
      )
      .get(opts.subject_id) as UserEvent | undefined) ?? null;
  }

  const conversionTs = conversion?.occurred_at ?? now;
  const amountUsd =
    opts.amount_usd ??
    conversion?.amount_usd ??
    Number(process.env.DEFAULT_CONVERSION_USD ?? 5);

  if (!conversion) {
    notes.push(
      "No conversion event found for subject; using current time as the qualifying moment.",
    );
  }

  const windowStart = conversionTs - lookbackDays * 24 * 60 * 60 * 1000;
  const windowEnd = conversionTs;

  // Eligible clicks for this subject inside the window, joined to influencer info.
  const rows = db
    .prepare(
      `SELECT e.id AS event_id, e.occurred_at, e.campaign_link_id,
              i.id AS influencer_id, i.display_name, i.wallet_address
         FROM user_events e
         JOIN campaign_links c ON c.id = e.campaign_link_id
         JOIN influencers i ON i.id = c.influencer_id
         WHERE e.anonymous_user_id = ?
           AND e.event_type = 'click'
           AND e.occurred_at BETWEEN ? AND ?
         ORDER BY e.occurred_at DESC`,
    )
    .all(opts.subject_id, windowStart, windowEnd) as Array<{
    event_id: string;
    occurred_at: number;
    campaign_link_id: string;
    influencer_id: string;
    display_name: string;
    wallet_address: string;
  }>;

  // Per-click raw weight: recency-weighted uses 1/(age_hours + 1);
  // last-click gives 1 to the most recent event only.
  const eligible: EligibleClick[] = rows.map((r, idx) => {
    const ageHours = Math.max(0, (conversionTs - r.occurred_at) / 3_600_000);
    const rawWeight =
      method === "last_click"
        ? idx === 0
          ? 1
          : 0
        : 1 / (ageHours + 1);
    return {
      event_id: r.event_id,
      influencer_id: r.influencer_id,
      influencer_display_name: r.display_name,
      campaign_link_id: r.campaign_link_id,
      occurred_at: r.occurred_at,
      age_hours: Number(ageHours.toFixed(3)),
      raw_weight: Number(rawWeight.toFixed(6)),
    };
  });

  // Aggregate per influencer, normalize, allocate USD.
  const byInfluencer = new Map<
    string,
    { display_name: string; wallet_address: string; summed_weight: number }
  >();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const clickWeight = eligible[i]!.raw_weight;
    const existing = byInfluencer.get(r.influencer_id);
    if (existing) {
      existing.summed_weight += clickWeight;
    } else {
      byInfluencer.set(r.influencer_id, {
        display_name: r.display_name,
        wallet_address: r.wallet_address,
        summed_weight: clickWeight,
      });
    }
  }

  const totalWeight = Array.from(byInfluencer.values()).reduce(
    (sum, v) => sum + v.summed_weight,
    0,
  );

  const perInfluencer: PerInfluencer[] = [];
  for (const [influencer_id, v] of byInfluencer.entries()) {
    const normalized = totalWeight > 0 ? v.summed_weight / totalWeight : 0;
    perInfluencer.push({
      influencer_id,
      display_name: v.display_name,
      wallet_address: v.wallet_address,
      summed_weight: Number(v.summed_weight.toFixed(6)),
      normalized_weight: Number(normalized.toFixed(6)),
      amount_usd: Number((normalized * amountUsd).toFixed(2)),
    });
  }
  perInfluencer.sort((a, b) => b.normalized_weight - a.normalized_weight);

  if (eligible.length === 0) {
    notes.push(
      `No eligible clicks found for subject ${opts.subject_id} within ${lookbackDays}-day window.`,
    );
  }
  if (method === "last_click" && eligible.length > 0) {
    notes.push("Last-click policy: only the most recent eligible click wins.");
  }

  const rationale: AttributionRationale = {
    method,
    lookback_days: lookbackDays,
    conversion_event_id: conversion?.id ?? null,
    conversion_amount_usd: amountUsd,
    window_start: windowStart,
    window_end: windowEnd,
    eligible_clicks: eligible,
    per_influencer: perInfluencer,
    notes,
  };

  // Persist decision + shares.
  const decisionId = nanoid(12);
  const createdAt = now;
  const decision: AttributionDecision = {
    id: decisionId,
    subject_id: opts.subject_id,
    conversion_event_id: conversion?.id ?? null,
    method,
    window_start: windowStart,
    window_end: windowEnd,
    total_amount_usd: amountUsd,
    rationale_json: JSON.stringify(rationale),
    created_at: createdAt,
  };

  const shares: AttributionShare[] = perInfluencer.map((p) => ({
    id: nanoid(12),
    decision_id: decisionId,
    influencer_id: p.influencer_id,
    weight: p.normalized_weight,
    amount_usd: p.amount_usd,
  }));

  const insertDecision = db.prepare(
    `INSERT INTO attribution_decisions
       (id, subject_id, conversion_event_id, method, window_start, window_end, total_amount_usd, rationale_json, created_at)
       VALUES (@id, @subject_id, @conversion_event_id, @method, @window_start, @window_end, @total_amount_usd, @rationale_json, @created_at)`,
  );
  const insertShare = db.prepare(
    `INSERT INTO attribution_shares
       (id, decision_id, influencer_id, weight, amount_usd)
       VALUES (@id, @decision_id, @influencer_id, @weight, @amount_usd)`,
  );
  const tx = db.transaction(() => {
    insertDecision.run(decision);
    for (const s of shares) insertShare.run(s);
  });
  tx();

  return { decision, shares, rationale };
}
