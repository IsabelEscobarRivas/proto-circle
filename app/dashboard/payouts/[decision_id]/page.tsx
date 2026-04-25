"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Rationale = {
  method: "recency_weighted" | "last_click";
  lookback_days: number;
  conversion_event_id: string | null;
  conversion_amount_usd: number;
  window_start: number;
  window_end: number;
  eligible_clicks: Array<{
    event_id: string;
    influencer_id: string;
    influencer_display_name: string;
    campaign_link_id: string;
    occurred_at: number;
    age_hours: number;
    raw_weight: number;
  }>;
  per_influencer: Array<{
    influencer_id: string;
    display_name: string;
    wallet_address?: string;
    summed_weight: number;
    normalized_weight: number;
    amount_usd: number;
  }>;
  notes: string[];
};

type Decision = {
  id: string;
  subject_id: string;
  method: string;
  total_amount_usd: number;
  created_at: number;
  window_start: number;
  window_end: number;
};

type Payout = {
  id: string;
  decision_id: string;
  recipient_wallet: string;
  amount_usd: number;
  status: "pending" | "sending" | "complete" | "failed";
  circle_tx_id: string | null;
  tx_hash: string | null;
  error: string | null;
  influencer_id: string;
  influencer_display_name: string;
  explorer_url: string | null;
};

type Response = {
  decision: Decision;
  rationale: Rationale;
  payouts: Payout[];
};

function fmt(ms: number): string {
  return new Date(ms).toLocaleString();
}

export default function PayoutsPage({
  params,
}: {
  params: Promise<{ decision_id: string }>;
}) {
  const { decision_id } = use(params);
  const [data, setData] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/dashboard/payouts/${encodeURIComponent(decision_id)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [decision_id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while any payout is non-terminal.
  useEffect(() => {
    if (!data) return;
    const pending = data.payouts.some(
      (p) => p.status === "pending" || p.status === "sending",
    );
    if (!pending) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [data, refresh]);

  async function triggerPayouts() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision_id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Failed");
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (err)
    return <p style={{ color: "var(--err)" }}>Error: {err}</p>;
  if (!data) return <p className="dim">Loading…</p>;

  const noPayoutsYet = data.payouts.length === 0;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="breadcrumb">
        <Link href="/">Overview</Link> / payouts /{" "}
        <span className="chip">{decision_id}</span>
      </div>

      <div className="card">
        <h2>Attribution decision</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 14,
            fontSize: 13,
          }}
        >
          <Stat label="Subject">
            <span className="chip">{data.decision.subject_id}</span>
          </Stat>
          <Stat label="Method">{data.decision.method}</Stat>
          <Stat label="Amount">${data.decision.total_amount_usd.toFixed(2)}</Stat>
          <Stat label="Resolved">{fmt(data.decision.created_at)}</Stat>
        </div>
        {data.rationale.notes.length > 0 && (
          <ul
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "var(--text-dim)",
              paddingLeft: 18,
            }}
          >
            {data.rationale.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>
          Rationale <small>who got credit, and why</small>
        </h2>
        {data.rationale.per_influencer.length === 0 ? (
          <p className="empty">
            No influencer shares — no eligible clicks in the lookback window.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Influencer</th>
                <th>Raw weight sum</th>
                <th>Normalized share</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.rationale.per_influencer.map((p) => (
                <tr key={p.influencer_id}>
                  <td>{p.display_name}</td>
                  <td className="mono">{p.summed_weight.toFixed(4)}</td>
                  <td>
                    <ShareBar value={p.normalized_weight} />
                  </td>
                  <td>${p.amount_usd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <details style={{ marginTop: 14 }}>
          <summary
            style={{ cursor: "pointer", fontSize: 13, color: "var(--text-dim)" }}
          >
            Full rationale (eligible clicks, raw weights)
          </summary>
          <pre className="pre" style={{ marginTop: 8 }}>
            {JSON.stringify(data.rationale, null, 2)}
          </pre>
        </details>
      </div>

      <div className="card">
        <h2>
          Payouts <small>{data.payouts.length}</small>
        </h2>
        {noPayoutsYet ? (
          <p className="empty">
            No payouts issued yet.
            <br />
            <button
              className="btn"
              onClick={triggerPayouts}
              disabled={busy || data.rationale.per_influencer.length === 0}
              style={{ marginTop: 10 }}
            >
              {busy ? "Sending…" : "Trigger payouts"}
            </button>
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {data.payouts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div>{p.influencer_display_name}</div>
                    <span
                      className="chip"
                      title={p.recipient_wallet}
                      style={{ fontSize: 11 }}
                    >
                      {p.recipient_wallet.slice(0, 6)}…{p.recipient_wallet.slice(-4)}
                    </span>
                  </td>
                  <td>${p.amount_usd.toFixed(2)}</td>
                  <td>
                    <span className={`tag ${p.status}`}>{p.status}</span>
                    {p.error && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--err)",
                          marginTop: 4,
                        }}
                      >
                        {p.error}
                      </div>
                    )}
                  </td>
                  <td>
                    {p.explorer_url ? (
                      <a
                        href={p.explorer_url}
                        target="_blank"
                        rel="noreferrer"
                        className="chip"
                      >
                        {p.tx_hash?.slice(0, 10)}…
                      </a>
                    ) : p.circle_tx_id ? (
                      <span className="dim mono">Circle #{p.circle_tx_id.slice(0, 8)}…</span>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          color: "var(--text-dim)",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ShareBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 8,
          background: "var(--border)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--accent)",
          }}
        />
      </div>
      <span className="mono" style={{ minWidth: 48, textAlign: "right" }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}
