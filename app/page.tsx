"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Influencer = {
  id: string;
  display_name: string;
  wallet_address: string;
  status: string;
};

type CampaignLinkRow = {
  id: string;
  influencer_id: string;
  influencer_display_name: string;
  merchant_domain: string;
  target_url: string;
  tracking_url: string;
  created_at: number;
};

type Subject = {
  subject_id: string;
  event_count: number;
  last_event_at: number;
};

type Decision = {
  id: string;
  subject_id: string;
  method: string;
  total_amount_usd: number;
  created_at: number;
  share_count: number;
  payout_count: number;
  payout_complete_count: number;
};

type Overview = {
  influencers: Influencer[];
  links: CampaignLinkRow[];
  subjects: Subject[];
  decisions: Decision[];
};

function formatTs(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString();
}

export default function Home() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/overview", { cache: "no-store" });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      setData(await res.json());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) return <p className="dim">Loading…</p>;
  if (err)
    return (
      <p style={{ color: "var(--err)" }}>Failed to load overview: {err}</p>
    );
  if (!data) return null;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid cols-2">
        <CreateInfluencer onCreated={refresh} />
        <CreateLink influencers={data.influencers} onCreated={refresh} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>
            Influencers <small>{data.influencers.length}</small>
          </h2>
          {data.influencers.length === 0 ? (
            <p className="empty">No influencers yet. Create one above.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Wallet</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.influencers.map((i) => (
                  <tr key={i.id}>
                    <td>{i.display_name}</td>
                    <td>
                      <span className="chip" title={i.wallet_address}>
                        {i.wallet_address.slice(0, 6)}…{i.wallet_address.slice(-4)}
                      </span>
                    </td>
                    <td>
                      <span className="tag">{i.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>
            Campaign Links <small>{data.links.length}</small>
          </h2>
          {data.links.length === 0 ? (
            <p className="empty">No campaign links yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Influencer</th>
                  <th>Merchant</th>
                  <th>Tracking URL</th>
                </tr>
              </thead>
              <tbody>
                {data.links.map((l) => (
                  <tr key={l.id}>
                    <td>{l.influencer_display_name}</td>
                    <td>{l.merchant_domain}</td>
                    <td>
                      <a
                        href={l.tracking_url}
                        target="_blank"
                        rel="noreferrer"
                        className="chip"
                      >
                        /r/{l.id}
                      </a>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ marginLeft: 6, padding: "2px 6px", fontSize: 11 }}
                        onClick={() =>
                          navigator.clipboard.writeText(l.tracking_url)
                        }
                      >
                        copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>
            Activity (anonymous users) <small>{data.subjects.length}</small>
          </h2>
          {data.subjects.length === 0 ? (
            <p className="empty">
              No click events yet. Open a tracking link in a new tab or
              incognito window to generate one.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Events</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.subjects.map((s) => (
                  <tr key={s.subject_id}>
                    <td>
                      <span className="chip">
                        {s.subject_id.slice(0, 16)}…
                      </span>
                    </td>
                    <td>{s.event_count}</td>
                    <td className="dim">{formatTs(s.last_event_at)}</td>
                    <td>
                      <Link
                        href={`/dashboard/timeline/${encodeURIComponent(s.subject_id)}`}
                      >
                        Timeline →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>
            Attribution decisions <small>{data.decisions.length}</small>
          </h2>
          {data.decisions.length === 0 ? (
            <p className="empty">
              No attribution decisions yet. Run one from a subject timeline.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Decision</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Payouts</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.decisions.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="chip">{d.id}</span>
                    </td>
                    <td>{d.method}</td>
                    <td>${d.total_amount_usd.toFixed(2)}</td>
                    <td>
                      {d.payout_complete_count}/{d.payout_count || d.share_count}{" "}
                      complete
                    </td>
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
    </div>
  );
}

function CreateInfluencer({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: name,
          wallet_address: wallet,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Failed");
      setName("");
      setWallet("");
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <h2>New influencer</h2>
      <div>
        <label htmlFor="inf-name">Display name</label>
        <input
          id="inf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alice"
          required
        />
      </div>
      <div>
        <label htmlFor="inf-wallet">Arc wallet address (0x…)</label>
        <input
          id="inf-wallet"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="0xabc…"
          required
        />
      </div>
      {err && <p style={{ color: "var(--err)", fontSize: 12 }}>{err}</p>}
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create influencer"}
        </button>
      </div>
    </form>
  );
}

function CreateLink({
  influencers,
  onCreated,
}: {
  influencers: Influencer[];
  onCreated: () => void;
}) {
  const [influencerId, setInfluencerId] = useState("");
  const [merchant, setMerchant] = useState("example-shop.com");
  const [target, setTarget] = useState("https://example-shop.com/products/tote");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!influencerId) return setErr("Pick an influencer.");
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/campaign-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: influencerId,
          merchant_domain: merchant,
          target_url: target,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Failed");
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <h2>New campaign link</h2>
      <div>
        <label htmlFor="link-inf">Influencer</label>
        <select
          id="link-inf"
          value={influencerId}
          onChange={(e) => setInfluencerId(e.target.value)}
          required
        >
          <option value="">— select —</option>
          {influencers.map((i) => (
            <option key={i.id} value={i.id}>
              {i.display_name}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <div>
          <label htmlFor="link-merchant">Merchant domain</label>
          <input
            id="link-merchant"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="link-target">Target URL</label>
          <input
            id="link-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          />
        </div>
      </div>
      {err && <p style={{ color: "var(--err)", fontSize: 12 }}>{err}</p>}
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create link"}
        </button>
      </div>
    </form>
  );
}
