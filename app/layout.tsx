import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Attribution & Micropayments — Instant Payouts on Arc Testnet",
  description:
    "Hackathon prototype: transparent attribution and instant USDC micropayments for creator-driven traffic on Arc Testnet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="layout">
          <header className="topbar">
            <div className="brand">
              <Link href="/" style={{ color: "inherit" }}>
                Attribution &amp; Micropayments
              </Link>
              <small>instant payouts · arc testnet · hackathon prototype</small>
            </div>
            <nav style={{ display: "flex", gap: 16, fontSize: 13 }}>
              <Link href="/">Overview</Link>
              <Link href="/demo">Live demo</Link>
              <a
                href="https://testnet.arcscan.app"
                target="_blank"
                rel="noreferrer"
              >
                Arcscan
              </a>
              <a
                href="https://faucet.circle.com"
                target="_blank"
                rel="noreferrer"
              >
                Faucet
              </a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
