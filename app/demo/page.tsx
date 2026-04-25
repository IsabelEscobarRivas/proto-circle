"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Wallet constants: testnet addresses, not secrets.
// Platform wallet pays out from the server side (lib/payout.ts). It must not
// appear as a creator. Creator A + Creator B are distinct developer-controlled
// wallets provisioned via `scripts/provision-creator-wallet.ts`.
const PLATFORM_WALLET = "0x9919d90b8debbfa5d126aad522935966b2deac3a";
const CREATOR_A = {
  display_name: "Creator A — older click (T−2.5h)",
  short_name: "Creator A",
  wallet_address: "0x74cd72c679248d815249d5269ad8bf07dc265ca6",
  offset_hours: 2.5,
};
const CREATOR_B = {
  display_name: "Creator B — newer click (T−0.5h)",
  short_name: "Creator B",
  wallet_address: "0x704d61937c67e39a0d53f4a014066f373a1b0241",
  offset_hours: 0.5,
};

/** Must match `lib/campaign-store.ts` pre-seeded `approvedCreators` ids. */
const POOL_CREATOR_A_ID = "creator-a";
const POOL_CREATOR_B_ID = "creator-b";

const AMOUNT_USD = 0.2;
const LOOKBACK_DAYS = 30;

// UI tokens — align with `app/page.tsx` (no logic; presentation only)
const C = {
  pageBg: "#f8f8f8",
  cardBg: "#ffffff",
  border: "#e5e7eb",
  text: "#1a1a1a",
  textMuted: "#6b7280",
  blue: "#2563eb",
  green: "#16a34a",
  amber: "#d97706",
  shadow: "0 2px 16px rgba(0,0,0,0.07)",
  stepInactiveBg: "#f3f4f6",
  rowRecentBg: "#eff6ff",
};

const cardShell: CSSProperties = {
  background: C.cardBg,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  boxShadow: C.shadow,
  padding: 20,
};

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

type StepState = "todo" | "current" | "done";

function short(addr: string, head = 6, tail = 4): string {
  if (addr.length < head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function nowStamp(): string {
  const d = new Date();
  return d.toLocaleTimeString([], { hour12: false });
}

function shortTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false });
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

function DemoPageContent() {
  const searchParams = useSearchParams();
  /** Stable default for SSR + first client paint — then sync from URL in useEffect to avoid hydration mismatch. */
  const [campaignName, setCampaignName] = useState("Demo Campaign");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, setTrace] = useState<string[]>([]);
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

  /** On-chain USDC (platform wallet) for idle/post-fund display; in-memory pool after sim starts. */
  const [onChainUsdc, setOnChainUsdc] = useState<string | null>(null);
  const [poolBalanceFlash, setPoolBalanceFlash] = useState(false);
  const fundPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fundPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fundPollBaselineRef = useRef(0);

  const [sparcMessages, setSparcMessages] = useState<
    { role: string; content: string }[]
  >([]);
  const [sparcInput, setSparcInput] = useState("");
  const [sparcLoading, setSparcLoading] = useState(false);
  const [briefApproved, setBriefApproved] = useState(false);

  const log = useCallback((msg: string) => {
    setTrace((t) => [...t, `${nowStamp()}  ${msg}`]);
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

  useEffect(() => {
    setCampaignName(searchParams.get("campaign") ?? "Demo Campaign");
  }, [searchParams]);

  // Initial pool fetch on mount.
  useEffect(() => {
    void refreshPool();
  }, [refreshPool]);

  useEffect(() => {
    let c = false;
    void (async () => {
      try {
        const res = await fetch("/api/campaigns/demo/balance");
        const j = (await res.json()) as { balance?: string };
        if (!c) setOnChainUsdc(j.balance ?? "0");
      } catch {
        if (!c) setOnChainUsdc("0");
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  // Theme: hide global dark topbar; paint body to match light shell (no API / logic)
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>("header.topbar");
    const prevBar = bar ? bar.style.display : "";
    if (bar) bar.style.display = "none";
    const prevBg = document.body.style.background;
    const prevColor = document.body.style.color;
    document.body.style.background = C.pageBg;
    document.body.style.color = C.text;
    return () => {
      if (bar) bar.style.display = prevBar;
      document.body.style.background = prevBg;
      document.body.style.color = prevColor;
    };
  }, []);

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
        poolCreatorId: string,
        stateInfluencerId: string,
        creatorLabel: string,
        walletAddress: string,
        linkId: string,
      ) => {
        setClickMicropayments((prev) => [
          ...prev,
          {
            creatorId: stateInfluencerId,
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
          }>("/api/campaigns/demo/clicks", {
            creatorId: poolCreatorId,
            linkId,
          });
          setClickMicropayments((prev) =>
            prev.map((m) =>
              m.creatorId === stateInfluencerId && m.circleTxId === null
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
              mp.creatorId === stateInfluencerId && mp.circleTxId === null
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
        POOL_CREATOR_A_ID,
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
        POOL_CREATOR_B_ID,
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

  const stopFundingPoll = useCallback(() => {
    if (fundPollIntervalRef.current) {
      clearInterval(fundPollIntervalRef.current);
      fundPollIntervalRef.current = null;
    }
    if (fundPollTimeoutRef.current) {
      clearTimeout(fundPollTimeoutRef.current);
      fundPollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => stopFundingPoll(), [stopFundingPoll]);

  const onFundCampaignClick = useCallback(() => {
    const baseline = parseFloat(onChainUsdc ?? "0");
    fundPollBaselineRef.current = Number.isFinite(baseline) ? baseline : 0;
    stopFundingPoll();

    const checkBalance = () => {
      void (async () => {
        try {
          const res = await fetch("/api/campaigns/demo/balance");
          const j = (await res.json()) as { balance?: string };
          const v = parseFloat(j.balance ?? "0");
          if (Number.isFinite(v) && v > fundPollBaselineRef.current) {
            fundPollBaselineRef.current = v;
            setOnChainUsdc(j.balance ?? String(v));
            setPoolBalanceFlash(true);
            window.setTimeout(() => setPoolBalanceFlash(false), 1200);
          }
        } catch {
          // ignore
        }
      })();
    };

    checkBalance();
    fundPollIntervalRef.current = setInterval(checkBalance, 5000);
    fundPollTimeoutRef.current = setTimeout(() => {
      stopFundingPoll();
    }, 60_000);
  }, [onChainUsdc, stopFundingPoll]);

  const activateCampaign = useCallback(async () => {
    stopFundingPoll();
    try {
      const raw =
        onChainUsdc != null && onChainUsdc !== ""
          ? parseFloat(onChainUsdc)
          : 0;
      const balance = Number.isFinite(raw) ? raw : 0;
      await postJson<{ poolBalance: number }>("/api/campaigns/demo/reset", {
        balance,
      });
      void seed();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      log(`POST /api/campaigns/demo/reset failed: ${m}`);
    }
  }, [seed, stopFundingPoll, onChainUsdc, log]);

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

  // --- causal step strip state -----------------------------------------

  const step1Done = clickAt.a !== undefined && clickAt.b !== undefined;
  const step2Done =
    clickMicropayments.length >= 2 &&
    clickMicropayments.every((m) => m.status === "initiated");
  const step3Done = !!rationale;
  const step4Done =
    payouts.length > 0 && payouts.every((p) => p.status === "complete");

  const stepStates = useMemo<StepState[]>(() => {
    const flags = [step1Done, step2Done, step3Done, step4Done];
    let foundCurrent = false;
    return flags.map((done) => {
      if (done) return "done";
      if (!foundCurrent) {
        foundCurrent = true;
        return "current";
      }
      return "todo";
    });
  }, [step1Done, step2Done, step3Done, step4Done]);

  // Derived: live event rows (most recent first), capped at 2.
  const eventRows = useMemo(() => {
    const rows: Array<{
      creatorId: string;
      creatorLabel: string;
      walletAddress: string;
      iso?: string;
      mp?: ClickMicropayment;
    }> = [];
    if (influencers[0]) {
      rows.push({
        creatorId: influencers[0].id,
        creatorLabel: CREATOR_A.short_name,
        walletAddress: CREATOR_A.wallet_address,
        iso: clickAt.a,
        mp: clickMicropayments.find((m) => m.creatorId === influencers[0]!.id),
      });
    }
    if (influencers[1]) {
      rows.push({
        creatorId: influencers[1].id,
        creatorLabel: CREATOR_B.short_name,
        walletAddress: CREATOR_B.wallet_address,
        iso: clickAt.b,
        mp: clickMicropayments.find((m) => m.creatorId === influencers[1]!.id),
      });
    }
    // Most recent first → Creator B (T−0.5h) before Creator A (T−2.5h).
    return [...rows].reverse().slice(0, 2);
  }, [influencers, clickAt, clickMicropayments]);

  const allComplete =
    payouts.length > 0 && payouts.every((p) => p.status === "complete");

  const idlePreSim =
    (phase === "idle" || phase === "error") && eventRows.length === 0;
  const showPreSimCTAs = idlePreSim && briefApproved;

  const showOnChainPoolDisplay = idlePreSim;

  const displayPoolDollars: number | null = useMemo(() => {
    if (showOnChainPoolDisplay) {
      if (onChainUsdc === null) return null;
      const n = parseFloat(onChainUsdc);
      return Number.isFinite(n) ? n : null;
    }
    if (pool) return pool.poolBalance;
    return null;
  }, [showOnChainPoolDisplay, onChainUsdc, pool]);

  const refreshPoolAndBalance = useCallback(async () => {
    await refreshPool();
    try {
      const res = await fetch("/api/campaigns/demo/balance");
      const j = (await res.json()) as { balance?: string };
      setOnChainUsdc(j.balance ?? "0");
    } catch {
      // ignore
    }
  }, [refreshPool]);

  const sparcBudgetStr = useMemo(() => {
    if (onChainUsdc != null && onChainUsdc !== "") {
      const n = parseFloat(onChainUsdc);
      if (Number.isFinite(n)) return `~$${n.toFixed(2)} USDC (on-chain pool)`;
    }
    return "See campaign pool (on-chain)";
  }, [onChainUsdc]);

  const sparcPayoutTerms = useMemo(
    () =>
      pool
        ? `$${pool.clickPayoutAmount.toFixed(2)}/click · $${pool.conversionPayoutAmount.toFixed(2)} conversion`
        : "$0.01/click · $0.20 conversion",
    [pool],
  );

  useEffect(() => {
    setSparcMessages([]);
    setSparcInput("");
    setBriefApproved(false);
  }, [campaignName]);

  const lastSpArcAssistant = useMemo(() => {
    const rev = [...sparcMessages].reverse();
    const a = rev.find((m) => m.role === "assistant");
    return a?.content ?? "";
  }, [sparcMessages]);

  /** Display only — last user + last assistant; full `sparcMessages` still sent to API. */
  const lastSparcUserBubble = useMemo(() => {
    for (let i = sparcMessages.length - 1; i >= 0; i--) {
      if (sparcMessages[i]!.role === "user") return sparcMessages[i]!;
    }
    return null;
  }, [sparcMessages]);

  const lastSparcAssistantBubble = useMemo(() => {
    for (let i = sparcMessages.length - 1; i >= 0; i--) {
      if (sparcMessages[i]!.role === "assistant")
        return sparcMessages[i]!;
    }
    return null;
  }, [sparcMessages]);

  const hasAssistantReply = useMemo(
    () => sparcMessages.some((m) => m.role === "assistant"),
    [sparcMessages],
  );

  const startSpArc = useCallback(async () => {
    const opening = {
      role: "user",
      content: "Generate the creator brief for this campaign.",
    };
    const newMessages = [opening];
    setSparcMessages(newMessages);
    setSparcLoading(true);
    try {
      const res = await fetch("/api/campaigns/demo/sparc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName,
          budget: sparcBudgetStr,
          payoutTerms: sparcPayoutTerms,
          messages: newMessages,
        }),
      });
      const data = (await res.json()) as { reply?: string };
      const reply =
        typeof data.reply === "string" && data.reply
          ? data.reply
          : "SpArc could not generate a reply. Check GEMINI_API_KEY.";
      setSparcMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch {
      setSparcMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            "Could not reach SpArc. Check your connection and GEMINI_API_KEY.",
        },
      ]);
    } finally {
      setSparcLoading(false);
    }
  }, [campaignName, sparcBudgetStr, sparcPayoutTerms]);

  const sendSpArcMessage = useCallback(async () => {
    const text = sparcInput.trim();
    if (!text || sparcLoading) return;
    const userMsg = { role: "user", content: text };
    const newMessages = [...sparcMessages, userMsg];
    setSparcMessages(newMessages);
    setSparcInput("");
    setSparcLoading(true);
    try {
      const res = await fetch("/api/campaigns/demo/sparc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName,
          budget: sparcBudgetStr,
          payoutTerms: sparcPayoutTerms,
          messages: newMessages,
        }),
      });
      const data = (await res.json()) as { reply?: string };
      const reply =
        typeof data.reply === "string" && data.reply
          ? data.reply
          : "SpArc could not generate a reply.";
      setSparcMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch {
      setSparcMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "Could not reach SpArc. Try again.",
        },
      ]);
    } finally {
      setSparcLoading(false);
    }
  }, [
    sparcInput,
    sparcLoading,
    sparcMessages,
    campaignName,
    sparcBudgetStr,
    sparcPayoutTerms,
  ]);

  // --- render helpers --------------------------------------------------

  const splitBar = rationale ? (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: 44,
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${C.border}`,
      }}
    >
      {rationale.per_influencer.map((p) => {
        const pct = Math.max(0, Math.min(1, p.normalized_weight));
        const isB = p.display_name.includes("Creator B");
        const bg = isB
          ? "linear-gradient(90deg, #16a34a 0%, #15803d 100%)"
          : "linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)";
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

  // --- JSX (theme only) ------------------------------------------------

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      />
      <div
        className="demoLightRoot"
        style={{
          margin: "-24px calc(50% - 50vw)",
          width: "100vw",
          maxWidth: "100vw",
          minHeight: "100vh",
          background: C.pageBg,
          color: C.text,
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <style
          dangerouslySetInnerHTML={{
            __html: `
            .demoLightRoot .demoBody a { color: ${C.blue}; text-decoration: none; font-weight: 500; }
            .demoLightRoot .demoBody a:hover { text-decoration: underline; }
            .demoLightRoot .demoTopNav a {
              color: ${C.textMuted};
              text-decoration: none;
              font-weight: 500;
              font-size: 14px;
            }
            .demoLightRoot .demoTopNav a:hover { color: ${C.text}; }
            .demoLightRoot .idleFundBtn {
              display: inline-flex; align-items: center; justify-content: center; gap: 8px;
              flex: 1 1 220px; min-width: 220px; min-height: 48px; padding: 0 20px; border-radius: 9999px;
              font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer;
              text-decoration: none; box-sizing: border-box; transition: background .15s, color .15s, border-color .15s;
              background: #ffffff; color: ${C.blue}; border: 2px solid ${C.blue};
            }
            .demoLightRoot .idleFundBtn:hover {
              background: ${C.blue}; color: #ffffff; border-color: ${C.blue};
            }
            .demoLightRoot .idleKickBtn {
              display: inline-flex; align-items: center; justify-content: center; gap: 8px;
              flex: 1 1 220px; min-width: 220px; min-height: 48px; padding: 0 20px; border-radius: 9999px;
              font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer;
              border: none; box-sizing: border-box; transition: background .15s;
              background: ${C.green}; color: #ffffff;
            }
            .demoLightRoot .idleKickBtn:hover { background: #15803d; }
            .demoLightRoot .idleKickBtn:disabled { opacity: 0.55; cursor: not-allowed; }
            @keyframes demoPoolBalanceFlash {
              0% { background-color: transparent; }
              40% { background-color: rgba(22, 163, 74, 0.28); }
              100% { background-color: transparent; }
            }
            .demoLightRoot .pool-balance-line--flash {
              animation: demoPoolBalanceFlash 1.2s ease-out 1;
              border-radius: 8px;
            }
          `,
          }}
        />

        <DemoNavBar />
        <main
          className="demoBody"
          style={{
            maxWidth: 1160,
            margin: "0 auto",
            padding: "0 32px 48px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <PersonalizedHeader campaignName={campaignName} />

          {idlePreSim ? (
            <section
              style={{
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: 24,
                boxShadow: C.shadow,
              }}
            >
              {briefApproved ? (
                <>
                  <div
                    style={{
                      display: "inline-block",
                      marginBottom: 14,
                      padding: "6px 12px",
                      borderRadius: 999,
                      background: "#dcfce7",
                      color: "#166534",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    ✅ Brief Approved — Distributing to 12 creators
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#2563eb",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      AS
                    </div>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        borderRadius: 12,
                        padding: "12px 16px",
                        fontSize: 14,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        background: "#f0f9ff",
                        border: "1px solid #bae6fd",
                        color: "#0c4a6e",
                      }}
                    >
                      {lastSpArcAssistant}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 17,
                          fontWeight: 700,
                          color: C.text,
                          marginBottom: 4,
                        }}
                      >
                        ⚡ SpArc — Campaign Brief Assistant
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: C.textMuted,
                        }}
                      >
                        Powered by Gemini
                      </p>
                    </div>
                    {sparcMessages.length === 0 ? (
                      <div style={{ flex: "0 0 auto" }}>
                        <button
                          type="button"
                          onClick={() => void startSpArc()}
                          disabled={sparcLoading}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 200,
                            minHeight: 44,
                            padding: "0 22px",
                            borderRadius: 999,
                            border: "none",
                            background: "#2563eb",
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "inherit",
                            cursor: sparcLoading ? "not-allowed" : "pointer",
                            opacity: sparcLoading ? 0.75 : 1,
                          }}
                        >
                          {sparcLoading ? "Generating…" : "Generate Creator Brief"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {sparcMessages.length > 0 ? (
                    <>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          marginTop: 20,
                        }}
                      >
                        {lastSparcUserBubble ? (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                            }}
                          >
                            <div
                              style={{
                                maxWidth: "min(100%, 720px)",
                                borderRadius: 12,
                                padding: "8px 14px",
                                fontSize: 13,
                                lineHeight: 1.5,
                                whiteSpace: "pre-wrap",
                                background: "#f9fafb",
                                border: "1px solid #e5e7eb",
                                color: "#374151",
                              }}
                            >
                              {lastSparcUserBubble.content}
                            </div>
                          </div>
                        ) : null}
                        {lastSparcAssistantBubble ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "#2563eb",
                                color: "#fff",
                                fontSize: 11,
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              AS
                            </div>
                            <div
                              style={{
                                flex: 1,
                                minWidth: 0,
                                maxWidth: "min(100%, 720px)",
                                borderRadius: 12,
                                padding: "12px 16px",
                                fontSize: 14,
                                lineHeight: 1.5,
                                whiteSpace: "pre-wrap",
                                background: "#f0f9ff",
                                border: "1px solid #bae6fd",
                                color: "#0c4a6e",
                              }}
                            >
                              {lastSparcAssistantBubble.content}
                            </div>
                          </div>
                        ) : null}
                        {sparcLoading ? (
                          <p
                            style={{
                              fontSize: 13,
                              fontStyle: "italic",
                              color: C.textMuted,
                              margin: "0 0 0 38px",
                            }}
                          >
                            SpArc is thinking…
                          </p>
                        ) : null}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 14,
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="text"
                          value={sparcInput}
                          onChange={(e) => setSparcInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void sendSpArcMessage();
                            }
                          }}
                          placeholder="Refine the brief..."
                          disabled={sparcLoading}
                          style={{
                            flex: "1 1 200px",
                            minWidth: 0,
                            height: 36,
                            boxSizing: "border-box",
                            padding: "0 12px",
                            borderRadius: 8,
                            border: `1px solid ${C.border}`,
                            fontSize: 14,
                            fontFamily: "inherit",
                            outline: "none",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void sendSpArcMessage()}
                          disabled={sparcLoading || !sparcInput.trim()}
                          style={{
                            height: 36,
                            padding: "0 16px",
                            borderRadius: 999,
                            border: "none",
                            background: C.blue,
                            color: "#fff",
                            fontSize: 13,
                            fontWeight: 600,
                            fontFamily: "inherit",
                            cursor:
                              sparcLoading || !sparcInput.trim()
                                ? "not-allowed"
                                : "pointer",
                            opacity: sparcLoading || !sparcInput.trim() ? 0.55 : 1,
                          }}
                        >
                          Send
                        </button>
                      </div>
                      {hasAssistantReply && !briefApproved ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setBriefApproved(true)}
                            disabled={sparcLoading}
                            style={{
                              width: "100%",
                              marginTop: 18,
                              padding: "14px 20px",
                              borderRadius: 12,
                              border: "none",
                              background: C.green,
                              color: "#fff",
                              fontSize: 15,
                              fontWeight: 600,
                              fontFamily: "inherit",
                              cursor: sparcLoading ? "not-allowed" : "pointer",
                              opacity: sparcLoading ? 0.6 : 1,
                            }}
                          >
                            ✅ Approve & Distribute Brief
                          </button>
                          <p
                            style={{
                              margin: "10px 0 0",
                              fontSize: 12,
                              color: C.textMuted,
                              textAlign: "center",
                            }}
                          >
                            Locks this brief for distribution to 12 creators
                          </p>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          <CausalStepStrip states={stepStates} />

          {showPreSimCTAs ? (
            <section
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "8px 0 4px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  alignItems: "stretch",
                  gap: 16,
                  width: "100%",
                  maxWidth: 720,
                }}
              >
                <a
                  className="idleFundBtn"
                  href="https://faucet.circle.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onFundCampaignClick}
                >
                  <span aria-hidden>👛</span>
                  Fund Your Campaign
                </a>
                <button
                  type="button"
                  className="idleKickBtn"
                  onClick={activateCampaign}
                >
                  <span aria-hidden>🚩</span>
                  Kick Off Your Campaign
                </button>
              </div>
              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: 13,
                  color: C.textMuted,
                  textAlign: "center",
                  maxWidth: 480,
                  lineHeight: 1.45,
                }}
              >
                Fund your wallet first, then kick off the live simulation.
              </p>
            </section>
          ) : null}

          <CampaignPoolCard
            pool={pool}
            campaignName={campaignName}
            onRefresh={() => void refreshPoolAndBalance()}
            displayPoolDollars={displayPoolDollars}
            isOnChainDisplay={showOnChainPoolDisplay}
            poolBalanceFlash={poolBalanceFlash}
          />
          <LiveEventsCard
            rows={eventRows}
            onSeed={seed}
            showHeaderSeed={!idlePreSim}
            seedDisabled={
              phase === "seeding" ||
              phase === "resolving" ||
              phase === "paying" ||
              phase === "polling"
            }
            seedLabel={
              phase === "seeding"
                ? "Seeding…"
                : eventRows.length === 0
                  ? "Seed scenario"
                  : "Reseed scenario"
            }
            emptyStateUseKickOff={showPreSimCTAs}
          />

          <section style={{ ...cardShell }}>
            <h2
              style={{
                margin: "0 0 4px 0",
                fontSize: 16,
                fontWeight: 600,
                color: C.text,
              }}
            >
              Log conversion
            </h2>
            <p style={{ margin: "0 0 14px 0", fontSize: 13, color: C.textMuted }}>
              When ready, run conversion + recency-weighted split + on-chain
              payout in one action.
            </p>
            <button
              type="button"
              onClick={resolveAndPay}
              disabled={!canResolveAndPay || isWorking}
              style={{
                width: "100%",
                border: "none",
                borderRadius: 999,
                padding: "14px 20px",
                fontSize: 15,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor:
                  !canResolveAndPay || isWorking ? "not-allowed" : "pointer",
                background: C.green,
                color: "#ffffff",
                opacity: !canResolveAndPay || isWorking ? 0.55 : 1,
              }}
            >
              {isWorking
                ? "Resolving and paying…"
                : "Log conversion + pay instantly"}
            </button>
          </section>

          <AttributionCard
            rationale={rationale}
            decision={decision}
            splitBar={splitBar}
          />
          <PayoutExecutionCard payouts={payouts} allComplete={allComplete} />

          {error ? (
            <div
              style={{
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#b91c1c",
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          ) : null}

          {decision ? (
            <div
              style={{
                fontSize: 12,
                color: C.textMuted,
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
        </main>
      </div>
    </>
  );
}

export default function DemoPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "40vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: C.pageBg,
            color: C.textMuted,
            fontFamily:
              "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
          }}
        >
          Loading…
        </div>
      }
    >
      <DemoPageContent />
    </Suspense>
  );
}

// --- components (UI only) ----------------------------------------------

function DemoNavBar() {
  return (
    <header
      style={{
        background: C.cardBg,
        borderBottom: `1px solid ${C.border}`,
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div>
        <Link
          href="/"
          style={{
            color: C.text,
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          Attribution &amp; Micropayments
        </Link>{" "}
        <span style={{ color: C.textMuted, fontSize: 12, marginLeft: 6 }}>
          instant payouts · arc testnet · hackathon prototype
        </span>
      </div>
      <nav
        className="demoTopNav"
        style={{ display: "flex", gap: 20, flexWrap: "wrap" }}
      >
        <Link href="/">Overview</Link>
        <Link href="/demo">Live demo</Link>
        <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">
          Arcscan
        </a>
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
          Faucet
        </a>
      </nav>
    </header>
  );
}

function PersonalizedHeader({ campaignName }: { campaignName: string }) {
  return (
    <div
      style={{
        width: "100vw",
        position: "relative",
        left: "50%",
        right: "50%",
        marginLeft: "-50vw",
        marginRight: "-50vw",
        background: C.cardBg,
        borderBottom: `1px solid ${C.border}`,
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: C.textMuted,
              marginBottom: 6,
            }}
          >
            Campaign Manager
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: C.text,
              lineHeight: 1.2,
            }}
          >
            {campaignName}
          </div>
          <div
            style={{ fontSize: 13, color: C.textMuted, marginTop: 6 }}
          >
            Live activity · Arc Testnet · Circle USDC
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: C.blue,
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            IE
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
              Isabel E.
            </div>
            <div style={{ fontSize: 12, color: C.textMuted }}>Campaign Owner</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CausalStepStrip({ states }: { states: StepState[] }) {
  const labels = [
    { icon: "⚡", text: "Click received" },
    { icon: "💸", text: "Micropayment sent" },
    { icon: "⚖️", text: "Attribution calculated" },
    { icon: "✅", text: "Payout confirmed" },
  ];
  const styleFor = (s: StepState): CSSProperties => {
    if (s === "done") {
      return { background: C.green, color: "#ffffff" };
    }
    if (s === "current") {
      return { background: C.blue, color: "#ffffff" };
    }
    return { background: C.stepInactiveBg, color: C.textMuted };
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        padding: "8px 0",
      }}
    >
      {labels.map((l, i) => (
        <div
          key={l.text}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.3,
              ...styleFor(states[i]!),
            }}
          >
            <span aria-hidden style={{ fontSize: 13 }}>
              {l.icon}
            </span>
            {l.text}
          </span>
          {i < labels.length - 1 ? (
            <span style={{ color: C.textMuted, opacity: 0.7 }}>→</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CampaignPoolCard({
  pool,
  campaignName,
  onRefresh,
  displayPoolDollars,
  isOnChainDisplay,
  poolBalanceFlash,
}: {
  pool: Campaign | null;
  campaignName: string;
  onRefresh: () => void;
  displayPoolDollars: number | null;
  isOnChainDisplay: boolean;
  poolBalanceFlash: boolean;
}) {
  const balanceLine =
    displayPoolDollars !== null && Number.isFinite(displayPoolDollars)
      ? displayPoolDollars.toFixed(2)
      : "—";
  const positive =
    displayPoolDollars !== null &&
    Number.isFinite(displayPoolDollars) &&
    displayPoolDollars > 0;
  const balanceColor =
    displayPoolDollars === null
      ? C.textMuted
      : positive
        ? C.green
        : "#dc2626";
  return (
    <section style={{ ...cardShell }}>
      <h2
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          margin: 0,
          fontSize: 16,
        }}
      >
        <span style={{ color: C.text }}>Campaign pool</span>
        <span style={{ color: C.textMuted, fontWeight: 500, fontSize: 14 }}>
          {campaignName}
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 8px",
            borderRadius: 999,
            background: C.green,
            color: "#ffffff",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.6,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "white",
              animation: "pulse 1.4s infinite",
            }}
          />
          LIVE
        </span>
      </h2>
      <div
        style={{
          display: "flex",
          gap: 36,
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginTop: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            Pool balance
            {isOnChainDisplay ? (
              <span
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: "none",
                  letterSpacing: 0,
                  color: C.textMuted,
                  marginTop: 2,
                }}
              >
                (on-chain wallet)
              </span>
            ) : null}
          </div>
          <div
            className={
              poolBalanceFlash ? "pool-balance-line--flash" : undefined
            }
            style={{
              display: "inline-block",
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1,
              color: balanceColor,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
            title={
              displayPoolDollars !== null
                ? `${displayPoolDollars} USDC`
                : undefined
            }
          >
            ${balanceLine}
            <span
              style={{
                fontSize: 16,
                color: C.textMuted,
                fontWeight: 500,
                marginLeft: 8,
                letterSpacing: 0,
              }}
            >
              USDC
            </span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted }}>Click payout</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
            ${pool ? pool.clickPayoutAmount.toFixed(2) : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted }}>
            Conversion payout
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
            ${pool ? pool.conversionPayoutAmount.toFixed(2) : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted }}>
            Approved creators
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
            {pool ? pool.approvedCreators.length : "—"}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button
            type="button"
            onClick={onRefresh}
            style={{
              fontSize: 12,
              fontWeight: 600,
              background: C.blue,
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Refresh
          </button>
        </div>
      </div>
      {pool && pool.approvedCreators.length > 0 ? (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: C.textMuted,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          {pool.approvedCreators.map((c) => (
            <code
              key={c.id}
              title={c.walletAddress}
              style={{
                background: C.stepInactiveBg,
                color: C.text,
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              {short(c.walletAddress)}
            </code>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LiveEventsCard({
  rows,
  onSeed,
  showHeaderSeed = true,
  seedDisabled,
  seedLabel,
  emptyStateUseKickOff = false,
}: {
  rows: Array<{
    creatorId: string;
    creatorLabel: string;
    walletAddress: string;
    iso?: string;
    mp?: ClickMicropayment;
  }>;
  onSeed: () => void;
  showHeaderSeed?: boolean;
  seedDisabled: boolean;
  seedLabel: string;
  emptyStateUseKickOff?: boolean;
}) {
  return (
    <section style={{ ...cardShell }}>
      <h2
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          margin: 0,
          fontSize: 16,
        }}
      >
        <span>
          <span style={{ color: C.text }}>Click received</span>{" "}
          <span style={{ color: C.textMuted, fontSize: 13, fontWeight: 400 }}>
            · instant micropayment
          </span>
        </span>
        {showHeaderSeed ? (
          <button
            type="button"
            onClick={onSeed}
            disabled={seedDisabled}
            style={{
              background: C.blue,
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: seedDisabled ? "not-allowed" : "pointer",
              opacity: seedDisabled ? 0.5 : 1,
              fontFamily: "inherit",
            }}
          >
            {seedLabel}
          </button>
        ) : null}
      </h2>

      {rows.length === 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            borderRadius: 8,
            background: C.stepInactiveBg,
            color: C.textMuted,
            fontSize: 13,
          }}
        >
          {emptyStateUseKickOff ? (
            <>
              No events yet — use{" "}
              <strong style={{ color: C.text }}>Kick Off Your Campaign</strong>{" "}
              above to run the two creator clicks and micropayments.
            </>
          ) : (
            <>
              No events yet — click{" "}
              <strong style={{ color: C.text }}>Seed scenario</strong> to generate
              two creator clicks.
            </>
          )}
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {rows.map((row, idx) => {
            const isMostRecent = idx === 0;
            return (
              <div
                key={row.creatorId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto auto auto",
                  gap: 16,
                  alignItems: "center",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  borderLeft: isMostRecent
                    ? `3px solid ${C.blue}`
                    : `1px solid ${C.border}`,
                  background: isMostRecent ? C.rowRecentBg : C.cardBg,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: isMostRecent ? C.blue : C.textMuted,
                  }}
                />
                <div>
                  <div
                    style={{ fontWeight: 600, fontSize: 14, color: C.text }}
                  >
                    {row.creatorLabel}
                  </div>
                  <code
                    style={{ color: C.textMuted, fontSize: 11, background: C.stepInactiveBg, padding: "0 4px", borderRadius: 3 }}
                  >
                    {short(row.walletAddress)}
                  </code>
                </div>
                <div
                  className="mono"
                  style={{ color: C.textMuted, fontSize: 12 }}
                  title={row.iso ?? ""}
                >
                  {shortTime(row.iso)}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    fontVariantNumeric: "tabular-nums",
                    color: C.green,
                  }}
                >
                  $0.01
                </div>
                <div>
                  {row.mp ? (
                    <LiveBadge mp={row.mp} />
                  ) : (
                    <span style={{ color: C.textMuted, fontSize: 11 }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AttributionCard({
  rationale,
  decision,
  splitBar,
}: {
  rationale: Rationale | null;
  decision: Decision | null;
  splitBar: ReactNode;
}) {
  const th: CSSProperties = {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: C.textMuted,
    padding: "8px 10px",
    borderBottom: `1px solid ${C.border}`,
  };
  const td: CSSProperties = {
    fontSize: 13,
    color: C.text,
    padding: "10px",
    borderBottom: `1px solid ${C.border}`,
  };
  return (
    <section style={{ ...cardShell }}>
      <h2
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          margin: 0,
          fontSize: 16,
        }}
      >
        <span style={{ color: C.text }}>Attribution calculated</span>
        <span style={{ color: C.textMuted, fontSize: 13, fontWeight: 400 }}>
          · recency-weighted
        </span>
      </h2>
      <p style={{ marginTop: 4, marginBottom: 12, fontSize: 13, color: C.textMuted }}>
        Creator B&apos;s click was more recent — they earn the larger share.
      </p>

      {!rationale || !decision ? (
        <div
          style={{
            border: `1px dashed ${C.border}`,
            borderRadius: 8,
            padding: "24px 16px",
            color: C.textMuted,
            fontSize: 13,
            background: C.pageBg,
          }}
        >
          Waiting for conversion…
        </div>
      ) : (
        <div>
          {splitBar}
          <table
            style={{
              marginTop: 14,
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th style={th}>Creator</th>
                <th style={th}>Click age</th>
                <th style={th}>Raw weight</th>
                <th style={{ ...th, textAlign: "right" }}>Normalized</th>
                <th style={{ ...th, textAlign: "right" }}>Allocation</th>
              </tr>
            </thead>
            <tbody>
              {rationale.per_influencer.map((p) => {
                const click = rationale.eligible_clicks.find(
                  (c) => c.influencer_id === p.influencer_id,
                );
                return (
                  <tr key={p.influencer_id}>
                    <td style={td}>{p.display_name}</td>
                    <td style={td}>
                      {click ? `${click.age_hours.toFixed(3)} h` : "—"}
                    </td>
                    <td style={td}>
                      {click ? click.raw_weight.toFixed(4) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {(p.normalized_weight * 100).toFixed(1)} %
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                      ${p.amount_usd.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 10, fontSize: 12, color: C.textMuted }}>
            decision{" "}
            <code
              style={{
                background: C.stepInactiveBg,
                color: C.text,
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 11,
              }}
            >
              {decision.id}
            </code>{" "}
            · total{" "}
            <strong style={{ color: C.text }}>
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
      )}
    </section>
  );
}

function payoutStatusStyle(
  status: Payout["status"],
): { bg: string; fg: string } {
  switch (status) {
    case "complete":
      return { bg: "#dcfce7", fg: C.green };
    case "failed":
      return { bg: "#fee2e2", fg: "#dc2626" };
    case "sending":
    case "pending":
    default:
      return { bg: "#fef3c7", fg: C.amber };
  }
}

function PayoutExecutionCard({
  payouts,
  allComplete,
}: {
  payouts: Payout[];
  allComplete: boolean;
}) {
  const th: CSSProperties = {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: C.textMuted,
    padding: "8px 10px",
    borderBottom: `1px solid ${C.border}`,
  };
  const td: CSSProperties = {
    fontSize: 13,
    color: C.text,
    padding: "10px",
    borderBottom: `1px solid ${C.border}`,
  };
  return (
    <section style={{ ...cardShell }}>
      <h2
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          margin: 0,
          fontSize: 16,
        }}
      >
        <span style={{ color: C.text }}>Payout confirmed</span>
        <span style={{ color: C.textMuted, fontSize: 13, fontWeight: 400 }}>
          · on-chain proof
        </span>
        {allComplete ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              borderRadius: 999,
              background: C.green,
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.8,
            }}
          >
            ✓ COMPLETE
          </span>
        ) : null}
      </h2>

      {payouts.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${C.border}`,
            borderRadius: 8,
            padding: "24px 16px",
            marginTop: 6,
            color: C.textMuted,
            fontSize: 13,
            background: C.pageBg,
          }}
        >
          Awaiting attribution…
        </div>
      ) : (
        <table
          style={{
            marginTop: 12,
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              <th style={th}>Creator</th>
              <th style={th}>Recipient</th>
              <th style={{ ...th, textAlign: "right" }}>Amount</th>
              <th style={th}>Status</th>
              <th style={th}>Tx hash</th>
              <th style={th}>Explorer</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => {
              const st = payoutStatusStyle(p.status);
              return (
                <tr key={p.id}>
                  <td style={td}>{p.influencer_display_name}</td>
                  <td style={td}>
                    <code
                      style={{
                        background: C.stepInactiveBg,
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontSize: 12,
                      }}
                    >
                      {short(p.recipient_wallet)}
                    </code>
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                    ${p.amount_usd.toFixed(2)}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.04,
                        background: st.bg,
                        color: st.fg,
                      }}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td style={td}>
                    {p.tx_hash ? (
                      <code
                        title={p.tx_hash}
                        style={{
                          background: C.stepInactiveBg,
                          padding: "1px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                        }}
                      >
                        {short(p.tx_hash, 8, 6)}
                      </code>
                    ) : (
                      <span style={{ color: C.textMuted }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    {p.tx_hash ? (
                      <a
                        href={`https://testnet.arcscan.app/tx/${p.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: C.blue, fontWeight: 600 }}
                      >
                        Arcscan ↗
                      </a>
                    ) : p.explorer_url ? (
                      <a
                        href={p.explorer_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: C.blue, fontWeight: 600 }}
                      >
                        Arcscan ↗
                      </a>
                    ) : (
                      <span style={{ color: C.textMuted }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {payouts.some((p) => p.error) ? (
        <div style={{ marginTop: 10 }}>
          {payouts
            .filter((p) => p.error)
            .map((p) => (
              <div
                key={p.id}
                style={{
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                }}
              >
                {p.influencer_display_name}: {p.error}
              </div>
            ))}
        </div>
      ) : null}
    </section>
  );
}

function LiveBadge({ mp }: { mp: ClickMicropayment }) {
  const isLive = mp.status === "live";
  const isOk = mp.status === "initiated";
  const bg = isLive || isOk ? C.green : "#dc2626";
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
        color: "#ffffff",
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
            background: "rgba(255,255,255,0.22)",
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
