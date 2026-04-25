"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The landing page (/) ships its own white nav as part of the redesign,
// so the global dark topbar is suppressed there to avoid a double header.
// Every other route keeps the global topbar.
export default function Topbar() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
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
  );
}
