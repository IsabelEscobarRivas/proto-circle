import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Topbar from "./_components/Topbar";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

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
    <html lang="en" className={inter.className}>
      <body>
        <div className="layout">
          <Topbar />
          {children}
        </div>
      </body>
    </html>
  );
}
