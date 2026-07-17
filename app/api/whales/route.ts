/**
 * app/api/whales/route.ts
 * Public GET endpoint — no x402 fee required.
 * Returns recent large on-chain transfers as whale summaries.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getRecentLargeTransfers,
  buildWhaleSummaries,
  WhaleTransferSummary,
} from "@/lib/alchemy";
import { generateMockTransactions } from "@/lib/anti-gravity/agent";

// Known whale aliases for display purposes
const KNOWN_ALIASES: Record<string, string> = {
  "0xd8da6bf26964af9d7eed9e03e53415d37aa96045": "Vitalik Buterin (vitalik.eth)",
  "0x176f3dab24a159341c0509bb36b833e7fdd0a132": "Justin Sun (Tron Founder)",
  "0x7056d6428d811d04423a63eb4c360be1c4a03e1e": "GCR (Legendary Trader)",
  "0x53461e4f60c1f855bf0241b9cc2455854047a0d6": "Arthur Hayes (BitMEX Founder)",
  "0x8ecc6a4e7cc3a0e16da7cfb4f18bdd32e63e33b9": "Andrew Kang",
};

export interface WhaleApiEntry {
  address: string;
  alias: string;
  totalVolumeUsd: number;
  txCount: number;
  netFlow: number;
  sampleTransactions: {
    hash: string;
    from: string;
    to: string | null;
    asset: string;
    value: number | null;
    timestamp: string;
    action: string;
  }[];
  source: "live" | "mock";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const sinceHours = parseInt(searchParams.get("sinceHours") || "24", 10);

  const isAlchemyConfigured =
    !!process.env.ALCHEMY_API_KEY &&
    !process.env.ALCHEMY_API_KEY.includes("your_alchemy_api_key_here");

  // ─── Live Path ──────────────────────────────────────────────────────────
  if (isAlchemyConfigured) {
    try {
      const transfers = await getRecentLargeTransfers(sinceHours, 100_000);
      const summaries = buildWhaleSummaries(transfers);

      const entries: WhaleApiEntry[] = summaries.map((s: WhaleTransferSummary) => {
        const alias = KNOWN_ALIASES[s.address.toLowerCase()] || `Whale ${s.address.slice(0, 8)}...`;
        return {
          address: s.address,
          alias,
          totalVolumeUsd: s.totalVolumeUsd,
          txCount: s.txCount,
          netFlow: s.netFlow,
          sampleTransactions: s.sampleTransactions.map((tx) => ({
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            asset: tx.asset,
            value: tx.value,
            timestamp: tx.metadata?.blockTimestamp || "recent",
            action: tx.from.toLowerCase() === s.address.toLowerCase() ? "SEND" : "RECEIVE",
          })),
          source: "live",
        };
      });

      return NextResponse.json({ whales: entries, source: "live", sinceHours });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[/api/whales] Live Alchemy fetch failed, using mock fallback:", msg);
      // Fall through to mock
    }
  }

  // ─── Mock Fallback ───────────────────────────────────────────────────────
  const mockTxs = generateMockTransactions("DAILY");
  const entries: WhaleApiEntry[] = mockTxs.map((tx) => ({
    address: tx.wallet,
    alias: tx.alias,
    totalVolumeUsd: parseFloat((tx.usdValue || "$0").replace(/[$,]/g, "")) || 0,
    txCount: 1,
    netFlow: tx.action === "WITHDRAW" || tx.action === "SELL" ? -1 : 1,
    sampleTransactions: [
      {
        hash: "0x" + Math.random().toString(16).slice(2).padEnd(64, "0"),
        from: tx.wallet,
        to: null,
        asset: tx.asset,
        value: parseFloat((tx.amount || "0").replace(/[^\d.]/g, "")) || null,
        timestamp: tx.timestamp,
        action: tx.action,
      },
    ],
    source: "mock",
  }));

  return NextResponse.json({
    whales: entries,
    source: "mock",
    sinceHours,
    warning: "Alchemy API key not configured or unreachable. Returning mock data.",
  });
}
