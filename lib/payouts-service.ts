import { nanoid } from "nanoid";
import {
  getDb,
  type AttributionShare,
  type Influencer,
  type Payout,
  type PayoutStatus,
} from "./db";
import {
  explorerUrl,
  getPayoutStatus,
  sendUsdc,
} from "./payout";

export type PayoutWithMeta = Payout & {
  influencer_id: string;
  influencer_display_name: string;
  explorer_url: string | null;
};

function enrich(row: Payout, influencer: Influencer): PayoutWithMeta {
  return {
    ...row,
    influencer_id: influencer.id,
    influencer_display_name: influencer.display_name,
    explorer_url: row.tx_hash ? explorerUrl(row.tx_hash) : null,
  };
}

/**
 * Initiate payouts for an attribution decision. Creates one payout row per
 * share, triggers the Circle transfer, and stores the Circle transaction ID.
 * Does NOT wait for chain finality — the dashboard polls `refreshPayouts` for
 * status transitions.
 */
export async function initiatePayoutsForDecision(
  decisionId: string,
): Promise<PayoutWithMeta[]> {
  const db = getDb();
  const decision = db
    .prepare("SELECT id FROM attribution_decisions WHERE id = ?")
    .get(decisionId);
  if (!decision) throw new Error(`Decision ${decisionId} not found.`);

  const existing = db
    .prepare("SELECT * FROM payouts WHERE decision_id = ?")
    .all(decisionId) as Payout[];
  if (existing.length > 0) {
    // Idempotency: if payouts exist, refresh and return them rather than
    // issuing duplicate on-chain transfers.
    return refreshPayouts(decisionId);
  }

  const shares = db
    .prepare(
      `SELECT s.*, i.wallet_address AS recipient_wallet
         FROM attribution_shares s
         JOIN influencers i ON i.id = s.influencer_id
         WHERE s.decision_id = ?`,
    )
    .all(decisionId) as Array<AttributionShare & { recipient_wallet: string }>;

  if (shares.length === 0) {
    throw new Error(`No attribution shares found for decision ${decisionId}.`);
  }

  // Skip zero-amount shares (e.g. last-click winners leave others at 0).
  const toPayout = shares.filter((s) => s.amount_usd > 0);
  if (toPayout.length === 0) {
    throw new Error(
      `All shares for decision ${decisionId} have zero amount.`,
    );
  }

  const now = Date.now();
  const insertPayout = db.prepare(
    `INSERT INTO payouts
       (id, decision_id, share_id, recipient_wallet, amount_usd, status, circle_tx_id, tx_hash, error, created_at, updated_at)
       VALUES (@id, @decision_id, @share_id, @recipient_wallet, @amount_usd, @status, @circle_tx_id, @tx_hash, @error, @created_at, @updated_at)`,
  );

  const created: Payout[] = [];
  for (const s of toPayout) {
    const payout: Payout = {
      id: nanoid(12),
      decision_id: decisionId,
      share_id: s.id,
      recipient_wallet: s.recipient_wallet,
      amount_usd: s.amount_usd,
      status: "pending",
      circle_tx_id: null,
      tx_hash: null,
      error: null,
      created_at: now,
      updated_at: now,
    };
    insertPayout.run(payout);
    created.push(payout);
  }

  // Issue transfers outside the transaction (network calls).
  const update = db.prepare(
    `UPDATE payouts SET status = @status, circle_tx_id = @circle_tx_id, error = @error, updated_at = @updated_at WHERE id = @id`,
  );
  for (const p of created) {
    try {
      const { circleTxId } = await sendUsdc(p.recipient_wallet, p.amount_usd);
      update.run({
        id: p.id,
        status: "sending" satisfies PayoutStatus,
        circle_tx_id: circleTxId,
        error: null,
        updated_at: Date.now(),
      });
    } catch (e) {
      update.run({
        id: p.id,
        status: "failed" satisfies PayoutStatus,
        circle_tx_id: null,
        error: (e as Error).message,
        updated_at: Date.now(),
      });
    }
  }

  return refreshPayouts(decisionId);
}

/**
 * Check Circle for status updates on any non-terminal payouts for the
 * decision, persist transitions, and return the fresh list.
 */
export async function refreshPayouts(
  decisionId: string,
): Promise<PayoutWithMeta[]> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.*, i.id AS influencer_id, i.display_name AS influencer_display_name
         FROM payouts p
         JOIN attribution_shares s ON s.id = p.share_id
         JOIN influencers i ON i.id = s.influencer_id
         WHERE p.decision_id = ?
         ORDER BY p.created_at ASC`,
    )
    .all(decisionId) as Array<
    Payout & { influencer_id: string; influencer_display_name: string }
  >;

  const update = db.prepare(
    `UPDATE payouts SET status = @status, tx_hash = @tx_hash, error = @error, updated_at = @updated_at WHERE id = @id`,
  );

  for (const row of rows) {
    if (!row.circle_tx_id) continue;
    if (row.status === "complete" || row.status === "failed") continue;
    try {
      const s = await getPayoutStatus(row.circle_tx_id);
      let nextStatus: PayoutStatus = row.status;
      if (s.state === "COMPLETE") nextStatus = "complete";
      else if (
        s.state === "FAILED" ||
        s.state === "CANCELLED" ||
        s.state === "DENIED"
      )
        nextStatus = "failed";
      else nextStatus = "sending";

      update.run({
        id: row.id,
        status: nextStatus,
        tx_hash: s.txHash ?? row.tx_hash,
        error: s.error ?? row.error,
        updated_at: Date.now(),
      });
      row.status = nextStatus;
      row.tx_hash = s.txHash ?? row.tx_hash;
      row.error = s.error ?? row.error;
    } catch (e) {
      // Leave status as-is; surface error for visibility.
      row.error = (e as Error).message;
    }
  }

  return rows.map((r) => ({
    id: r.id,
    decision_id: r.decision_id,
    share_id: r.share_id,
    recipient_wallet: r.recipient_wallet,
    amount_usd: r.amount_usd,
    status: r.status,
    circle_tx_id: r.circle_tx_id,
    tx_hash: r.tx_hash,
    error: r.error,
    created_at: r.created_at,
    updated_at: r.updated_at,
    influencer_id: r.influencer_id,
    influencer_display_name: r.influencer_display_name,
    explorer_url: r.tx_hash ? explorerUrl(r.tx_hash) : null,
  }));
}
