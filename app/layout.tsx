import type { Metadata } from "next";
import "./globals.css";
import Topbar from "./_components/Topbar";

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
          <Topbar />
          {children}
        </div>
      </body>
    </html>
  );
}
