import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH = process.env.DB_PATH ?? join(process.cwd(), "data", "app.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS influencers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_links (
  id TEXT PRIMARY KEY,
  influencer_id TEXT NOT NULL REFERENCES influencers(id),
  merchant_domain TEXT NOT NULL,
  target_url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaign_links_influencer ON campaign_links(influencer_id);

CREATE TABLE IF NOT EXISTS user_events (
  id TEXT PRIMARY KEY,
  anonymous_user_id TEXT NOT NULL,
  campaign_link_id TEXT REFERENCES campaign_links(id),
  event_type TEXT NOT NULL,
  amount_usd REAL,
  occurred_at INTEGER NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_user ON user_events(anonymous_user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_link ON user_events(campaign_link_id);

CREATE TABLE IF NOT EXISTS attribution_decisions (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  conversion_event_id TEXT REFERENCES user_events(id),
  method TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  total_amount_usd REAL NOT NULL,
  rationale_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decisions_subject ON attribution_decisions(subject_id);

CREATE TABLE IF NOT EXISTS attribution_shares (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES attribution_decisions(id),
  influencer_id TEXT NOT NULL REFERENCES influencers(id),
  weight REAL NOT NULL,
  amount_usd REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shares_decision ON attribution_shares(decision_id);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES attribution_decisions(id),
  share_id TEXT NOT NULL REFERENCES attribution_shares(id),
  recipient_wallet TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  status TEXT NOT NULL,
  circle_tx_id TEXT,
  tx_hash TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payouts_decision ON payouts(decision_id);
`;

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  _db = db;
  return db;
}

// Types matching table rows (SQLite returns numbers as numbers, strings as strings).

export type Influencer = {
  id: string;
  display_name: string;
  wallet_address: string;
  status: "active" | "paused";
  created_at: number;
};

export type CampaignLink = {
  id: string;
  influencer_id: string;
  merchant_domain: string;
  target_url: string;
  created_at: number;
};

export type EventType = "click" | "landing" | "conversion";

export type UserEvent = {
  id: string;
  anonymous_user_id: string;
  campaign_link_id: string | null;
  event_type: EventType;
  amount_usd: number | null;
  occurred_at: number;
  metadata_json: string | null;
};

export type AttributionMethod = "recency_weighted" | "last_click";

export type AttributionDecision = {
  id: string;
  subject_id: string;
  conversion_event_id: string | null;
  method: AttributionMethod;
  window_start: number;
  window_end: number;
  total_amount_usd: number;
  rationale_json: string;
  created_at: number;
};

export type AttributionShare = {
  id: string;
  decision_id: string;
  influencer_id: string;
  weight: number;
  amount_usd: number;
};

export type PayoutStatus = "pending" | "sending" | "complete" | "failed";

export type Payout = {
  id: string;
  decision_id: string;
  share_id: string;
  recipient_wallet: string;
  amount_usd: number;
  status: PayoutStatus;
  circle_tx_id: string | null;
  tx_hash: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
};
