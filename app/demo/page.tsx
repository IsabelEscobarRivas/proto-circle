"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Wallet constants: testnet addresses, not secrets.
// Platform wallet pays out from the server side (lib/payout.ts). It must not
// appear as a creator. Creator A + Creator B are distinct developer-controlled
// wallets provisioned via `scripts/provision-creator-wallet.ts`.
const PLATFORM_WALLET = "0x9919d90b8debbfa5d126aad522935966b2deac3a";
const CREATOR_A = {
  display_name: "Creator A — older click (T−2.5h)",
  wallet_address: "0x74cd72c679248d815249d5269ad8bf07dc265ca6",
  offset_hours: 2.5,
};
const CREATOR_B = {
  display_name: "Creator B — newer click (T−0.5h)",
  wallet_address: "0x704d61937c67e39a0d53f4a014066f373a1b0241",
  offset_hours: 0.5,
};

const AMOUNT_USD = 0.2;
const LOOKBACK_DAYS = 30;

type Influencer = {
  id: string;
  display_name: string;
  wallet_address: string;
};

type CampaignLink = {
  id: string;
  influencer_id: string;
  tracking_url: string;
};

type Decision = {
  id: string;
  subject_id: string;
  method: string;
  total_amount_usd: number;
};

type PerInfluencerShare = {
  influencer_id: string;
  display_name: string;
  wallet_address: string;
  summed_weight: number;
  normalized_weight: number;
  amount_usd: number;
};

type EligibleClick = {
  event_id: string;
  influencer_id: string;
  influencer_display_name: string;
  occurred_at: number;
  age_hours: number;
  raw_weight: number;
};

type Rationale = {
  method: string;
  lookback_days: number;
  conversion_amount_usd: number;
  eligible_clicks: EligibleClick[];
  per_influencer: PerInfluencerShare[];
  notes: string[];
};

type Payout = {
  id: string;
  recipient_wallet: string;
  amount_usd: number;
  status: "pending" | "sending" | "complete" | "failed";
  circle_tx_id: string | null;
  tx_hash: string | null;
  explorer_url: string | null;
  influencer_id: string;
  influencer_display_name: string;
  error?: string | null;
};

type Campaign = {
  id: string;
  poolBalance: number;
  approvedCreators: Array<{ id: string; walletAddress: string }>;
  clickPayoutAmount: number;
  conversionPayoutAmount: number;
};

type ClickMicropayment = {
  creatorId: string;
  creatorLabel: string;
  walletAddress: string;
  amount: number;
  status: "live" | "initiated" | "failed";
  circleTxId: string | null;
  error: string | null;
};

type Phase =
  | "idle"
  | "seeding"
  | "ready"
  | "resolving"
  | "resolved"
  | "paying"
  | "polling"
  | "done"
  | "error";

function short(addr: string, head = 6, tail = 4): string {
  if (addr.length < head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function now(): string {
  const d = new Date();
  return d.toLocaleTimeString([], { hour12: false });
}

function statusTag(status: Payout["status"]) {
  return <span className={`tag ${status}`}>{status}</span>;
}

async function postJson<T>(path: string, body: object): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export default function DemoPage() {
  const searchParams = useSearchParams();
  const campaignName = searchParams.get("campaign") ?? "Demo Campaign";
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<string[]>([]);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [links, setLinks] = useState<CampaignLink[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [clickAt, setClickAt] = useState<{ a?: string; b?: string }>({});
  const [decision, setDecision] = useState<Decision | null>(null);
  const [rationale, setRationale] = useState<Rationale | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [pool, setPool] = useState<Campaign | null>(null);
  const [clickMicropayments, setClickMicropayments] = useState<
    ClickMicropayment[]
  >([]);

  const log = useCallback((msg: string) => {
    setTrace((t) => [...t, `${now()}  ${msg}`]);
  }, []);

  const refreshPool = useCallback(async () => {
    try {
      const c = await getJson<Campaign>("/api/campaigns/demo");
      setPool(c);
      return c;
    } catch (e) {
      log(`pool refresh failed: ${(e as Error).message}`);
      return null;
    }
  }, [log]);

  // Initial pool fetch on mount.
  useEffect(() => {
    void refreshPool();
  }, [refreshPool]);

  const preflightOk = useMemo(() => {
    const a = CREATOR_A.wallet_address.toLowerCase();
    const b = CREATOR_B.wallet_address.toLowerCase();
    const p = PLATFORM_WALLET.toLowerCase();
    const valid = (x: string) => /^0x[0-9a-f]{40}$/.test(x);
    return (
      valid(a) &&
      valid(b) &&
      a !== b &&
      a !== p &&
      b !== p
    );
  }, []);

  const seed = useCallback(async () => {
    setPhase("seeding");
    setError(null);
    setTrace([]);
    setInfluencers([]);
    setLinks([]);
    setDecision(null);
    setRationale(null);
    setPayouts([]);
    setClickMicropayments([]);
    try {
      if (!preflightOk) {
        throw new Error(
          "Demo-wallet policy violated: Creator A / B must be distinct, non-platform, 0x-prefixed addresses.",
        );
      }

      const initialPool = await refreshPool();
      if (initialPool) {
        log(`Pool balance at start: $${initialPool.poolBalance.toFixed(2)} USDC`);
      }

      log("Creating two creators with distinct wallets…");
      const infA = await postJson<{ influencer: Influencer }>("/api/influencers", {
        display_name: CREATOR_A.display_name,
        wallet_address: CREATOR_A.wallet_address,
      });
      const infB = await postJson<{ influencer: Influencer }>("/api/influencers", {
        display_name: CREATOR_B.display_name,
        wallet_address: CREATOR_B.wallet_address,
      });
      const infs = [infA.influencer, infB.influencer];
      setInfluencers(infs);
      log(`  Creator A id=${infA.influencer.id}`);
      log(`  Creator B id=${infB.influencer.id}`);

      log("Approving creators in campaign pool…");
      await postJson("/api/campaigns/demo/approve", {
        id: infA.influencer.id,
        walletAddress: CREATOR_A.wallet_address,
      });
      await postJson("/api/campaigns/demo/approve", {
        id: infB.influencer.id,
        walletAddress: CREATOR_B.wallet_address,
      });
      await refreshPool();

      log("Minting two campaign links…");
      const linkA = await postJson<{ link: CampaignLink }>("/api/campaign-links", {
        influencer_id: infA.influencer.id,
        merchant_domain: "demo-merchant.example",
        target_url: "https://demo-merchant.example/products/sku-a",
      });
      const linkB = await postJson<{ link: CampaignLink }>("/api/campaign-links", {
        influencer_id: infB.influencer.id,
        merchant_domain: "demo-merchant.example",
        target_url: "https://demo-merchant.example/products/sku-b",
      });
      setLinks([linkA.link, linkB.link]);
      log(`  Link A ${linkA.link.id}`);
      log(`  Link B ${linkB.link.id}`);

      const subject = `anon_demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      setSubjectId(subject);
      log(`New subject cookie: ${subject}`);

      const t = Date.now();
      const aIso = new Date(t - CREATOR_A.offset_hours * 3_600_000).toISOString();
      const bIso = new Date(t - CREATOR_B.offset_hours * 3_600_000).toISOString();
      setClickAt({ a: aIso, b: bIso });

      const fireClickMicropayment = async (
        creatorId: string,
        creatorLabel: string,
        walletAddress: string,
        linkId: string,
      ) => {
        setClickMicropayments((prev) => [
          ...prev,
          {
            creatorId,
            creatorLabel,
            walletAddress,
            amount: 0.01,
            status: "live",
            circleTxId: null,
            error: null,
          },
        ]);
        try {
          const res = await postJson<{
            status: string;
            amount: number;
            circleTxId: string;
            poolBalance: number;
          }>("/api/campaigns/demo/clicks", { creatorId, linkId });
          setClickMicropayments((prev) =>
            prev.map((m) =>
              m.creatorId === creatorId && m.circleTxId === null
                ? {
                    ...m,
                    status: "initiated",
                    circleTxId: res.circleTxId,
                    amount: res.amount,
                  }
                : m,
            ),
          );
          setPool((p) => (p ? { ...p, poolBalance: res.poolBalance } : p));
          log(
            `  click micropayment ${creatorLabel}: $${res.amount.toFixed(2)} initiated (${res.circleTxId.slice(0, 10)}…) — pool $${res.poolBalance.toFixed(2)}`,
          );
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          setClickMicropayments((prev) =>
            prev.map((mp) =>
              mp.creatorId === creatorId && mp.circleTxId === null
                ? { ...mp, status: "failed", error: m }
                : mp,
            ),
          );
          log(`  click micropayment ${creatorLabel} FAILED: ${m}`);
          await refreshPool();
          throw e;
        }
      };

      log(`Posting click A at ${aIso} (T−${CREATOR_A.offset_hours}h)…`);
      await postJson("/api/events", {
        anonymous_user_id: subject,
        event_type: "click",
        campaign_link_id: linkA.link.id,
        occurred_at: aIso,
      });
      await fireClickMicropayment(
        infA.influencer.id,
        "Creator A",
        CREATOR_A.wallet_address,
        linkA.link.id,
      );

      log(`Posting click B at ${bIso} (T−${CREATOR_B.offset_hours}h)…`);
      await postJson("/api/events", {
        anonymous_user_id: subject,
        event_type: "click",
        campaign_link_id: linkB.link.id,
        occurred_at: bIso,
      });
      await fireClickMicropayment(
        infB.influencer.id,
        "Creator B",
        CREATOR_B.wallet_address,
        linkB.link.id,
      );

      log("Scenario ready.");
      setPhase("ready");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      log(`ERROR ${m}`);
      setPhase("error");
    }
  }, [log, preflightOk, refreshPool]);

  const resolveAndPay = useCallback(async () => {
    if (!subjectId) return;
    setPhase("resolving");
    setError(null);
    try {
      log(`Logging conversion ($${AMOUNT_USD.toFixed(2)})…`);
      const conv = await postJson<{ event: { id: string } }>("/api/events", {
        anonymous_user_id: subjectId,
        event_type: "conversion",
        amount_usd: AMOUNT_USD,
        metadata: {
          order_id: `demo-${Date.now().toString(36)}`,
          merchant_domain: "demo-merchant.example",
        },
      });
      log(`  conversion event ${conv.event.id}`);

      log("Resolving attribution (recency-weighted)…");
      const resolved = await postJson<{
        decision: Decision;
        rationale: Rationale;
      }>("/api/attribution/resolve", {
        subject_id: subjectId,
        conversion_event_id: conv.event.id,
        method: "recency_weighted",
        amount_usd: AMOUNT_USD,
        lookback_days: LOOKBACK_DAYS,
      });
      setDecision(resolved.decision);
      setRationale(resolved.rationale);
      log(`  decision ${resolved.decision.id}`);

      setPhase("paying");
      log("Triggering payouts…");
      const paid = await postJson<{ payouts: Payout[] }>("/api/payouts", {
        decision_id: resolved.decision.id,
      });
      setPayouts(paid.payouts);
      log(`  ${paid.payouts.length} payout(s) initiated`);
      for (const p of paid.payouts) {
        log(`    circle_tx=${p.circle_tx_id ?? "pending"}  state=${p.status}`);
      }
      const afterPay = await refreshPool();
      if (afterPay) {
        log(`  pool after attribution deduction: $${afterPay.poolBalance.toFixed(2)}`);
      }

      setPhase("polling");
      const terminal = (p: Payout) =>
        p.status === "complete" || p.status === "failed";
      let lastStates = paid.payouts.map((p) => p.status).join(",");

      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const poll = await getJson<{ payouts: Payout[] }>(
          `/api/dashboard/payouts/${resolved.decision.id}`,
        );
        setPayouts(poll.payouts);
        const states = poll.payouts.map((p) => p.status).join(",");
        if (states !== lastStates) {
          log(`state transition: ${lastStates}  →  ${states}`);
          lastStates = states;
        }
        if (poll.payouts.every(terminal)) {
          log("All payouts terminal.");
          await refreshPool();
          setPhase("done");
          return;
        }
      }
      log("Polling stopped after 100 s (still non-terminal).");
      await refreshPool();
      setPhase("done");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      log(`ERROR ${m}`);
      setPhase("error");
    }
  }, [subjectId, log, refreshPool]);

  const canResolveAndPay = phase === "ready";
  const isWorking =
    phase === "resolving" || phase === "paying" || phase === "polling";

  const byId = useMemo(() => {
    const m = new Map<string, Influencer>();
    for (const i of influencers) m.set(i.id, i);
    return m;
  }, [influencers]);

  // --- render helpers -------------------------------------------------

  const splitBar = rationale ? (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: 44,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      {rationale.per_influencer.map((p, idx) => {
        const pct = Math.max(0, Math.min(1, p.normalized_weight));
        const bg =
          idx === 0
            ? "linear-gradient(90deg, #3ecf8e 0%, #2aa673 100%)"
            : "linear-gradient(90deg, #5b8cff 0%, #3e6edb 100%)";
        const label = p.display_name.split("—")[0]!.trim();
        return (
          <div
            key={p.influencer_id}
            style={{
              flexGrow: pct,
              flexBasis: 0,
              background: bg,
              color: "white",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: 0.2,
              padding: "0 6px",
              textAlign: "center",
              overflow: "hidden",
            }}
            title={`${p.display_name}: ${(pct * 100).toFixed(2)}% · $${p.amount_usd.toFixed(2)}`}
          >
            <span
              style={{
                fontSize: 11,
                opacity: 0.9,
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              {label}
            </span>
            <span>
              {(pct * 100).toFixed(1)}% · ${p.amount_usd.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  ) : null;

  // --- JSX ------------------------------------------------------------

  return (
    <main className="stack" style={{ gap: 18 }}>
      <div>
        <div className="breadcrumb">
          <Link href="/">Overview</Link> / Live demo
        </div>
        <h1>Live demo: click → attribution → instant payout</h1>
        <p className="dim" style={{ maxWidth: 760 }}>
          This page walks a single deterministic scenario through the same
          APIs the dashboard uses. Two creators earn a conversion with two
          recency-different clicks; the engine splits ${AMOUNT_USD.toFixed(2)} USDC
          roughly 30 / 70; both shares land on Arc Testnet as independent
          Circle transactions.
        </p>
      </div>

      {/* Campaign pool */}
      <section
        className="card"
        style={{ borderColor: "var(--accent, #3ecf8e)" }}
      >
        <h2>
          Campaign pool <small>{campaignName}</small>
        </h2>
        <div
          style={{
            display: "flex",
            gap: 28,
            flexWrap: "wrap",
            alignItems: "baseline",
            marginTop: 8,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              Pool balance
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: pool && pool.poolBalance > 0 ? "#3ecf8e" : "var(--err)",
                fontVariantNumeric: "tabular-nums",
              }}
              title={pool ? `${pool.poolBalance} USDC` : ""}
            >
              ${pool ? pool.poolBalance.toFixed(2) : "—"}{" "}
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-dim)",
                  fontWeight: 400,
                }}
              >
                USDC
              </span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              Click payout
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              ${pool ? pool.clickPayoutAmount.toFixed(2) : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              Conversion payout
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              ${pool ? pool.conversionPayoutAmount.toFixed(2) : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              Approved creators
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {pool ? pool.approvedCreators.length : "—"}
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <button
              className="btn"
              onClick={() => void refreshPool()}
              style={{ fontSize: 12 }}
            >
              Refresh
            </button>
          </div>
        </div>
        {pool && pool.approvedCreators.length > 0 ? (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "var(--text-dim)",
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            {pool.approvedCreators.map((c) => (
              <code key={c.id} title={c.walletAddress}>
                {short(c.walletAddress)}
              </code>
            ))}
          </div>
        ) : null}
      </section>

      {/* Scenario summary */}
      <section className="card">
        <h2>
          Scenario <small>deterministic · recency-weighted · {LOOKBACK_DAYS}-day lookback</small>
        </h2>
        <div className="grid cols-2" style={{ marginTop: 12 }}>
          <CreatorCard label="Creator A (older click)" creator={CREATOR_A} platformAddr={PLATFORM_WALLET} />
          <CreatorCard label="Creator B (newer click)" creator={CREATOR_B} platformAddr={PLATFORM_WALLET} />
        </div>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            color: "var(--text-dim)",
            fontSize: 13,
          }}
        >
          <span>
            Conversion: <strong style={{ color: "var(--text)" }}>${AMOUNT_USD.toFixed(2)} USDC</strong>
          </span>
          <span>
            Expected split: <strong style={{ color: "var(--text)" }}>30 % / 70 %</strong>
          </span>
          <span>
            Platform payout wallet:{" "}
            <code>{short(PLATFORM_WALLET)}</code>
          </span>
        </div>
      </section>

      {/* Step 1: seed */}
      <section className="card">
        <h2>
          Step 1 — Simulate two creator clicks <small>{phaseTag(phase, "seeding", "ready")}</small>
        </h2>
        <p className="dim">
          Seeds two creators, two campaign links, one anonymous visitor (cookie
          subject), and two clicks at fixed past timestamps so the rationale is
          reproducible for the audience.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            className="btn"
            onClick={seed}
            disabled={phase === "seeding" || phase === "resolving" || phase === "paying" || phase === "polling"}
          >
            {phase === "idle" || phase === "error" ? "Seed scenario" : "Reseed scenario"}
          </button>
          {subjectId ? (
            <span className="chip" title="anonymous visitor cookie">
              subject: {short(subjectId, 12, 6)}
            </span>
          ) : null}
        </div>

        {influencers.length === 2 && links.length === 2 ? (
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Wallet</th>
                <th>Link</th>
                <th>Click at</th>
                <th>Click micropayment</th>
              </tr>
            </thead>
            <tbody>
              {influencers.map((inf, idx) => {
                const link = links.find((l) => l.influencer_id === inf.id);
                const ts = idx === 0 ? clickAt.a : clickAt.b;
                const mp = clickMicropayments.find(
                  (m) => m.creatorId === inf.id,
                );
                return (
                  <tr key={inf.id}>
                    <td>{inf.display_name}</td>
                    <td><code>{short(inf.wallet_address)}</code></td>
                    <td><code>{link?.id ?? "—"}</code></td>
                    <td className="mono" style={{ color: "var(--text-dim)" }}>
                      {ts ?? "—"}
                    </td>
                    <td>
                      {mp ? <LiveBadge mp={mp} /> : <span className="dim">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>

      {/* Step 2: resolve attribution + trigger payouts (single action) */}
      <section className="card">
        <h2>
          Step 2 — Log conversion + instant payout{" "}
          <small>
            {isWorking ? (
              <span className="tag sending">in progress</span>
            ) : phase === "done" ? (
              <span className="tag complete">done</span>
            ) : null}
          </small>
        </h2>
        <p className="dim">
          One click runs the full tail of the pipeline: records the
          conversion event, resolves recency-weighted attribution
          (<code>1 / (age_hours + 1)</code> per click, normalized per
          creator), and immediately fires one Circle USDC transfer per
          creator share via <code>POST /api/payouts</code>.
        </p>
        <div style={{ marginTop: 12 }}>
          <button
            className="btn"
            onClick={resolveAndPay}
            disabled={!canResolveAndPay || isWorking}
          >
            {isWorking ? "Resolving and paying…" : "Log conversion + pay"}
          </button>
        </div>

        {rationale && decision ? (
          <div style={{ marginTop: 18 }}>
            {splitBar}
            <table style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>Creator</th>
                  <th>Click age</th>
                  <th>Raw weight</th>
                  <th style={{ textAlign: "right" }}>Normalized</th>
                  <th style={{ textAlign: "right" }}>Allocation</th>
                </tr>
              </thead>
              <tbody>
                {rationale.per_influencer.map((p) => {
                  const click = rationale.eligible_clicks.find(
                    (c) => c.influencer_id === p.influencer_id,
                  );
                  return (
                    <tr key={p.influencer_id}>
                      <td>{p.display_name}</td>
                      <td>{click ? `${click.age_hours.toFixed(3)} h` : "—"}</td>
                      <td>{click ? click.raw_weight.toFixed(4) : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        {(p.normalized_weight * 100).toFixed(1)} %
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        ${p.amount_usd.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-dim)" }}>
              decision <code>{decision.id}</code> · total{" "}
              <strong style={{ color: "var(--text)" }}>
                ${decision.total_amount_usd.toFixed(2)}
              </strong>
              {rationale.notes.length > 0 ? (
                <>
                  {" · "}
                  <em>{rationale.notes.join(" · ")}</em>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {payouts.length > 0 ? (
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Recipient</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
                <th>Tx hash</th>
                <th>Explorer</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{p.influencer_display_name}</td>
                  <td><code>{short(p.recipient_wallet)}</code></td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    ${p.amount_usd.toFixed(2)}
                  </td>
                  <td>{statusTag(p.status)}</td>
                  <td>
                    {p.tx_hash ? (
                      <code title={p.tx_hash}>{short(p.tx_hash, 8, 6)}</code>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td>
                    {p.tx_hash ? (
                      <a
                        href={`https://testnet.arcscan.app/tx/${p.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Arcscan ↗
                      </a>
                    ) : p.explorer_url ? (
                      <a href={p.explorer_url} target="_blank" rel="noreferrer">
                        Arcscan ↗
                      </a>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {payouts.some((p) => p.error) ? (
          <div style={{ marginTop: 10 }}>
            {payouts
              .filter((p) => p.error)
              .map((p) => (
                <div
                  key={p.id}
                  className="pre"
                  style={{ borderColor: "var(--err)", color: "var(--err)" }}
                >
                  {p.influencer_display_name}: {p.error}
                </div>
              ))}
          </div>
        ) : null}
      </section>

      {/* Status + trace */}
      <section className="card">
        <h2>
          Trace <small>{phase}</small>
        </h2>
        {error ? (
          <div
            className="pre"
            style={{ borderColor: "var(--err)", color: "var(--err)" }}
          >
            {error}
          </div>
        ) : null}
        {trace.length === 0 ? (
          <div className="empty">
            Logs appear here as each API call completes.
          </div>
        ) : (
          <div className="pre" style={{ maxHeight: 260, overflowY: "auto" }}>
            {trace.join("\n")}
          </div>
        )}
        {decision ? (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "var(--text-dim)",
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span>
              Decision:{" "}
              <Link href={`/dashboard/payouts/${decision.id}`}>
                view on dashboard ↗
              </Link>
            </span>
            {subjectId ? (
              <span>
                Timeline:{" "}
                <Link href={`/dashboard/timeline/${subjectId}`}>
                  view on dashboard ↗
                </Link>
              </span>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

// --- components ---------------------------------------------------------

function CreatorCard({
  label,
  creator,
  platformAddr,
}: {
  label: string;
  creator: { display_name: string; wallet_address: string; offset_hours: number };
  platformAddr: string;
}) {
  const isPlatform =
    creator.wallet_address.toLowerCase() === platformAddr.toLowerCase();
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 14,
        background: "var(--bg)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {creator.display_name}
      </div>
      <div className="mono" style={{ color: "var(--text-dim)" }}>
        {creator.wallet_address}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: isPlatform ? "var(--err)" : "var(--text-dim)",
        }}
      >
        {isPlatform
          ? "ERROR: cannot use the platform wallet as a creator."
          : `click offset: T − ${creator.offset_hours} h`}
      </div>
    </div>
  );
}

function LiveBadge({ mp }: { mp: ClickMicropayment }) {
  const isLive = mp.status === "live";
  const isOk = mp.status === "initiated";
  const bg = isLive
    ? "#e11d48"
    : isOk
      ? "#3ecf8e"
      : "var(--err)";
  const label = isLive
    ? "LIVE"
    : isOk
      ? `LIVE · $${mp.amount.toFixed(2)}`
      : "FAILED";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 999,
        background: bg,
        color: "white",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.6,
        animation: isLive ? "pulse 1s infinite" : undefined,
      }}
      title={
        mp.circleTxId
          ? `Circle tx ${mp.circleTxId}`
          : mp.error ?? "in flight"
      }
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "white",
          opacity: isLive ? 1 : 0.85,
        }}
      />
      {label}
      {mp.circleTxId ? (
        <code
          style={{
            background: "rgba(255,255,255,0.18)",
            padding: "0 4px",
            borderRadius: 3,
            fontSize: 10,
          }}
        >
          {mp.circleTxId.slice(0, 8)}…
        </code>
      ) : null}
    </span>
  );
}

function phaseTag(
  phase: Phase,
  active: Phase,
  done: Phase,
): React.ReactNode {
  if (phase === active) return <span className="tag sending">in progress</span>;
  if (
    phase === done ||
    (done === "ready" && (phase === "resolving" || phase === "resolved" || phase === "paying" || phase === "polling" || phase === "done")) ||
    (done === "resolved" && (phase === "paying" || phase === "polling" || phase === "done")) ||
    (done === "done" && phase === "done")
  ) {
    return <span className="tag complete">done</span>;
  }
  return null;
}
