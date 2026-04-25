"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// UI-only landing page. All styles are inline so the global dark theme in
// app/globals.css is not affected and we don't have to touch any other file.
// Backend, API routes, and the demo page logic are intentionally untouched.
// ---------------------------------------------------------------------------

const COLOR = {
  bg: "#f8f8f8",
  surface: "#ffffff",
  textPrimary: "#1a1a1a",
  textMuted: "#6b7280",
  accentBlue: "#2563eb",
  accentGreen: "#16a34a",
  accentAmber: "#d97706",
  border: "#e5e7eb",
};

type Campaign = {
  name: string;
  budget: string;
  creators: number;
  payout: string;
  status: "ACTIVE" | "FILLING" | "DEMO";
};

const campaigns: Campaign[] = [
  {
    name: "StyLens Spring Drop",
    budget: "$500 USDC",
    creators: 12,
    payout: "$0.01/click · 20% conversion",
    status: "ACTIVE",
  },
  {
    name: "Arc Ecosystem Launch",
    budget: "$1,200 USDC",
    creators: 28,
    payout: "$0.02/click · 15% conversion",
    status: "ACTIVE",
  },
  {
    name: "Circle Payments Campaign",
    budget: "$300 USDC",
    creators: 8,
    payout: "$0.01/click · 10% conversion",
    status: "FILLING",
  },
  {
    name: "Web3 Creator Fund",
    budget: "$2,000 USDC",
    creators: 45,
    payout: "$0.05/click · 25% conversion",
    status: "ACTIVE",
  },
  {
    name: "Testnet Beta Program",
    budget: "$100 USDC",
    creators: 5,
    payout: "$0.01/click · flat $0.20",
    status: "DEMO",
  },
  {
    name: "Creator Launch Accelerator",
    budget: "$750 USDC",
    creators: 18,
    payout: "$0.03/click · 15% conversion",
    status: "ACTIVE",
  },
];

function statusColor(status: Campaign["status"]) {
  switch (status) {
    case "ACTIVE":
      return { bg: "#dcfce7", fg: COLOR.accentGreen };
    case "FILLING":
      return { bg: "#fef3c7", fg: COLOR.accentAmber };
    case "DEMO":
      return { bg: "#dbeafe", fg: COLOR.accentBlue };
  }
}

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const canSubmit = name.trim().length > 0;
  const params = canSubmit ? `?campaign=${encodeURIComponent(name.trim())}` : "";

  const go = (mode: "start" | "join") => {
    if (!canSubmit) return;
    router.push(`/demo${params}&mode=${mode}`);
  };

  return (
    <>
      {/* Inter font. Rendered in the page body; browsers honor it fine. */}
      <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
      />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin=""
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      />

      <div
        style={{
          // Break out of the global .layout container (max-width 1160, p:24)
          // so the light theme covers the full viewport visually.
          margin: "-24px calc(50% - 50vw)",
          background: COLOR.bg,
          color: COLOR.textPrimary,
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          minHeight: "100vh",
        }}
      >
        {/* Nav bar */}
        <header
          style={{
            background: COLOR.surface,
            borderBottom: `1px solid ${COLOR.border}`,
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
                color: COLOR.textPrimary,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              Attribution &amp; Micropayments
            </Link>{" "}
            <span
              style={{
                color: COLOR.textMuted,
                fontSize: 12,
                marginLeft: 6,
              }}
            >
              instant payouts · arc testnet · hackathon prototype
            </span>
          </div>
          <nav style={{ display: "flex", gap: 20, fontSize: 14 }}>
            <Link href="/" style={navLinkStyle}>
              Overview
            </Link>
            <Link href="/demo" style={navLinkStyle}>
              Live demo
            </Link>
            <a
              href="https://testnet.arcscan.app"
              target="_blank"
              rel="noreferrer"
              style={navLinkStyle}
            >
              Arcscan
            </a>
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noreferrer"
              style={navLinkStyle}
            >
              Faucet
            </a>
          </nav>
        </header>

        {/* Hero */}
        <section
          style={{
            padding: "72px 32px 48px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontSize: 52,
              lineHeight: 1.08,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: 0,
              maxWidth: 880,
              color: COLOR.textPrimary,
            }}
          >
            Run campaigns. Pay on real engagement.
          </h1>
          <p
            style={{
              marginTop: 18,
              fontSize: 18,
              lineHeight: 1.5,
              color: COLOR.textMuted,
              maxWidth: 640,
            }}
          >
            Fund a creator campaign, track clicks and conversions,
            <br />
            and pay out USDC automatically — verified on-chain.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 24,
              marginTop: 28,
              fontSize: 14,
              color: COLOR.textMuted,
            }}
          >
            <span>👛 Campaign wallet</span>
            <span>👥 Approved creators</span>
            <span>⚡ Instant micropayments</span>
            <span>🔗 On-chain proof</span>
          </div>

          {/* Entry card */}
          <div
            style={{
              marginTop: 40,
              background: COLOR.surface,
              border: `1px solid ${COLOR.border}`,
              borderRadius: 20,
              boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
              padding: 24,
              width: "100%",
              maxWidth: 560,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Campaign name or code"
              style={{
                width: "100%",
                padding: "14px 20px",
                borderRadius: 999,
                border: `1px solid ${COLOR.border}`,
                background: COLOR.surface,
                color: COLOR.textPrimary,
                fontSize: 15,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => go("start")}
                disabled={!canSubmit}
                style={{
                  ...pillButton,
                  background: COLOR.accentGreen,
                  opacity: canSubmit ? 1 : 0.5,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                Start a Campaign
              </button>
              <button
                onClick={() => go("join")}
                disabled={!canSubmit}
                style={{
                  ...pillButton,
                  background: COLOR.accentBlue,
                  opacity: canSubmit ? 1 : 0.5,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                Join a Campaign
              </button>
            </div>
          </div>
        </section>

        {/* Live Campaigns */}
        <section
          style={{
            padding: "16px 32px 56px",
            maxWidth: 1160,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: COLOR.textMuted,
              marginBottom: 16,
            }}
          >
            Live Campaigns
          </div>

          <div className="campaign-grid">
            {campaigns.map((c) => (
              <CampaignCard key={c.name} campaign={c} />
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer
          style={{
            padding: "24px 16px 40px",
            textAlign: "center",
            color: COLOR.textMuted,
            fontSize: 13,
          }}
        >
          Proto-Circle · Arc Testnet · Powered by Circle USDC
        </footer>

        {/* Scoped responsive grid + hover effects without touching globals.css */}
        <style>{`
          .campaign-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 16px;
          }
          @media (max-width: 960px) {
            .campaign-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          }
          @media (max-width: 600px) {
            .campaign-grid { grid-template-columns: 1fr; }
          }
          .campaign-card {
            background: ${COLOR.surface};
            border: 1px solid ${COLOR.border};
            border-radius: 16px;
            box-shadow: 0 2px 16px rgba(0,0,0,0.07);
            padding: 20px;
            text-decoration: none;
            color: ${COLOR.textPrimary};
            display: flex;
            flex-direction: column;
            gap: 10px;
            transition: transform 160ms ease, box-shadow 160ms ease;
          }
          .campaign-card:hover {
            transform: scale(1.02);
            box-shadow: 0 8px 28px rgba(0,0,0,0.12);
            text-decoration: none;
          }
        `}</style>
      </div>
    </>
  );
}

const navLinkStyle: React.CSSProperties = {
  color: COLOR.textMuted,
  textDecoration: "none",
  fontWeight: 500,
};

const pillButton: React.CSSProperties = {
  flex: 1,
  padding: "12px 16px",
  borderRadius: 999,
  border: "none",
  color: "white",
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "inherit",
  letterSpacing: 0.1,
};

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const c = statusColor(campaign.status);
  return (
    <Link
      className="campaign-card"
      href={`/demo?campaign=${encodeURIComponent(campaign.name)}`}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: COLOR.textPrimary,
            lineHeight: 1.3,
          }}
        >
          {campaign.name}
        </div>
        <span
          style={{
            background: c.bg,
            color: c.fg,
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {campaign.status}
        </span>
      </div>

      <div
        style={{
          color: COLOR.accentGreen,
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        {campaign.budget}
      </div>

      <div style={{ color: COLOR.textMuted, fontSize: 13 }}>
        👥 {campaign.creators} creators
      </div>

      <div style={{ color: COLOR.textMuted, fontSize: 12 }}>
        {campaign.payout}
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 8,
          color: COLOR.accentBlue,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        View campaign →
      </div>
    </Link>
  );
}
