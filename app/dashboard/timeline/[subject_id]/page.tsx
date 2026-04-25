"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type TimelineEvent = {
  id: string;
  anonymous_user_id: string;
  campaign_link_id: string | null;
  event_type: "click" | "landing" | "conversion";
  amount_usd: number | null;
  occurred_at: number;
  metadata_json: string | null;
  influencer_id: string | null;
  influencer_display_name: string | null;
  merchant_domain: string | null;
  target_url: string | null;
};

type DecisionSummary = {
  id: string;
  method: string;
  total_amount_usd: number;
  window_start: number;
  window_end: number;
  conversion_event_id: string | null;
  created_at: number;
};

type TimelineResponse = {
  subject_id: string;
  events: TimelineEvent[];
  decisions: DecisionSummary[];
};

function fmt(ms: number): string {
  return new Date(ms).toLocaleString();
}

export default function TimelinePage({
  params,
}: {
  params: Promise<{ subject_id: string }>;
}) {
  const { subject_id } = use(params);
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(5);
  const [method, setMethod] = useState<"recency_weighted" | "last_click">(
    "recency_weighted",
  );
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(
      `/api/dashboard/timeline/${encodeURIComponent(subject_id)}`,
      { cache: "no-store" },
    );
    setData(await res.json());
  }, [subject_id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function simulateConversion() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymous_user_id: subject_id,
          event_type: "conversion",
          amount_usd: amount,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Failed");
      setMsg(`Conversion event recorded ($${amount}).`);
      refresh();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function resolveAttribution() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/attribution/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id,
          method,
          amount_usd: amount,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Failed");
      window.location.href = `/dashboard/payouts/${encodeURIComponent(body.decision.id)}`;
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  if (!data) return <p className="dim">Loading…</p>;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="breadcrumb">
        <Link href="/">Overview</Link> / timeline /{" "}
        <span className="chip">{subject_id}</span>
      </div>

      <div className="card">
        <h2>Run attribution / simulate conversion</h2>
        <div className="row" style={{ alignItems: "end", gap: 10 }}>
          <div>
            <label htmlFor="amount">Conversion amount (USD)</label>
            <input
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="method">Attribution method</label>
            <select
              id="method"
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as "recency_weighted" | "last_click")
              }
            >
              <option value="recency_weighted">Recency-weighted</option>
              <option value="last_click">Last click wins</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn secondary"
              onClick={simulateConversion}
              disabled={busy}
            >
              Log conversion
            </button>
            <button
              className="btn"
              onClick={resolveAttribution}
              disabled={busy}
            >
              Resolve attribution
            </button>
          </div>
        </div>
        {msg && (
          <p style={{ marginTop: 10, fontSize: 12 }} className="dim">
            {msg}
          </p>
        )}
      </div>

      <div className="card">
        <h2>
          Events <small>{data.events.length}</small>
        </h2>
        {data.events.length === 0 ? (
          <p className="empty">No events for this subject.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Influencer</th>
                <th>Merchant / amount</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.id}>
                  <td className="dim mono">{fmt(e.occurred_at)}</td>
                  <td>
                    <span className={`tag ${e.event_type}`}>
                      {e.event_type}
                    </span>
                  </td>
                  <td>
                    {e.influencer_display_name ?? (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td>
                    {e.event_type === "conversion"
                      ? `$${(e.amount_usd ?? 0).toFixed(2)}`
                      : (e.merchant_domain ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>
          Past decisions for this subject{" "}
          <small>{data.decisions.length}</small>
        </h2>
        {data.decisions.length === 0 ? (
          <p className="empty">No attribution decisions yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Method</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.decisions.map((d) => (
                <tr key={d.id}>
                  <td className="dim mono">{fmt(d.created_at)}</td>
                  <td>{d.method}</td>
                  <td>${d.total_amount_usd.toFixed(2)}</td>
                  <td>
                    <Link
                      href={`/dashboard/payouts/${encodeURIComponent(d.id)}`}
                    >
                      View →
                    </Link>
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
