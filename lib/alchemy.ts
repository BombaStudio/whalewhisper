/**
 * lib/alchemy.ts
 * Server-side only Alchemy API integration module.
 * NEVER import this in client components — it uses server-only env vars.
 */

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";
const ALCHEMY_NETWORK = process.env.ALCHEMY_NETWORK || "eth-mainnet";

/** Build the Alchemy RPC base URL for the configured network */
function alchemyRpcUrl(): string {
  if (!ALCHEMY_API_KEY) throw new Error("ALCHEMY_API_KEY is not configured.");
  return `https://${ALCHEMY_NETWORK}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
}

/** Build the Alchemy Prices API base URL */
function alchemyPricesUrl(): string {
  if (!ALCHEMY_API_KEY) throw new Error("ALCHEMY_API_KEY is not configured.");
  return `https://api.g.alchemy.com/prices/v1/${ALCHEMY_API_KEY}`;
}

/** Post to Alchemy JSON-RPC */
async function alchemyRpc(method: string, params: unknown[]): Promise<unknown> {
  const url = alchemyRpcUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alchemy RPC error (${method}): ${res.status} ${text}`);
  }
  const json = await res.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`Alchemy RPC error (${method}): ${json.error.message}`);
  return json.result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlchemyTransfer {
  from: string;
  to: string | null;
  asset: string;
  value: number | null;
  hash: string;
  blockNum: string;
  category: string;
  rawContract?: { address?: string; decimal?: string };
  metadata?: { blockTimestamp?: string };
}

export interface WhaleTransferSummary {
  address: string;
  totalVolumeUsd: number;
  txCount: number;
  netFlow: number; // positive = net inflow, negative = net outflow
  sampleTransactions: AlchemyTransfer[];
}

export interface TokenBalance {
  symbol: string;
  name: string;
  contractAddress: string;
  decimals: number;
  balanceRaw: string;
  balanceFormatted: number;
  usdPrice: number;
  usdValue: number;
}

// ---------------------------------------------------------------------------
// 1. getRecentLargeTransfers
// ---------------------------------------------------------------------------

/**
 * Fetches recent large ERC-20 + ETH transfers on Ethereum Mainnet above a USD threshold.
 * Returns raw AlchemyTransfer list (unfiltered by USD unless prices API is used).
 */
export async function getRecentLargeTransfers(
  sinceHours: number = 24,
  usdThreshold: number = 100_000
): Promise<AlchemyTransfer[]> {
  const toBlock = "latest";
  // Approximate: Ethereum produces ~7200 blocks/day
  const blocksPerHour = 300;
  const fromBlockOffset = Math.ceil(sinceHours * blocksPerHour);

  try {
    const currentBlockHex = await alchemyRpc("eth_blockNumber", []) as string;
    const currentBlock = parseInt(currentBlockHex, 16);
    const fromBlock = Math.max(0, currentBlock - fromBlockOffset);
    const fromBlockHex = "0x" + fromBlock.toString(16);

    const result = await alchemyRpc("alchemy_getAssetTransfers", [
      {
        fromBlock: fromBlockHex,
        toBlock,
        category: ["external", "erc20"],
        withMetadata: true,
        excludeZeroValue: true,
        maxCount: "0x3e8", // 1000 transfers max
      },
    ]) as { transfers: AlchemyTransfer[] };

    const transfers = result?.transfers || [];

    // Filter to transfers where value > threshold (approximate — value is in ETH units for native)
    // We do a rough filter: value > 10 ETH for native, or any ERC-20 large value
    const large = transfers.filter((t) => {
      if (t.asset === "ETH" && t.value && t.value >= 10) return true;
      // For ERC-20 we can't filter by USD without prices; include all named assets
      if (t.asset && t.asset !== "ETH" && t.value && t.value > 0) return true;
      return false;
    });

    return large;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`getRecentLargeTransfers failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 2. getWalletTransactionHistory
// ---------------------------------------------------------------------------

export async function getWalletTransactionHistory(
  address: string,
  sinceHours: number = 24
): Promise<AlchemyTransfer[]> {
  const blocksPerHour = 300;
  const fromBlockOffset = Math.ceil(sinceHours * blocksPerHour);

  try {
    const currentBlockHex = await alchemyRpc("eth_blockNumber", []) as string;
    const currentBlock = parseInt(currentBlockHex, 16);
    const fromBlock = Math.max(0, currentBlock - fromBlockOffset);
    const fromBlockHex = "0x" + fromBlock.toString(16);

    const [outbound, inbound] = await Promise.all([
      alchemyRpc("alchemy_getAssetTransfers", [
        {
          fromBlock: fromBlockHex,
          toBlock: "latest",
          fromAddress: address,
          category: ["external", "erc20"],
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: "0x1f4", // 500
        },
      ]) as Promise<{ transfers: AlchemyTransfer[] }>,
      alchemyRpc("alchemy_getAssetTransfers", [
        {
          fromBlock: fromBlockHex,
          toBlock: "latest",
          toAddress: address,
          category: ["external", "erc20"],
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: "0x1f4",
        },
      ]) as Promise<{ transfers: AlchemyTransfer[] }>,
    ]);

    return [...(outbound?.transfers || []), ...(inbound?.transfers || [])];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`getWalletTransactionHistory(${address}) failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 3. getWalletTokenBalances
// ---------------------------------------------------------------------------

export async function getWalletTokenBalances(address: string): Promise<TokenBalance[]> {
  try {
    // Get raw ERC-20 balances
    const balancesResult = await alchemyRpc("alchemy_getTokenBalances", [address]) as {
      tokenBalances: { contractAddress: string; tokenBalance: string }[];
    };

    const nonZero = (balancesResult?.tokenBalances || []).filter(
      (b) => b.tokenBalance && b.tokenBalance !== "0x0000000000000000000000000000000000000000000000000000000000000000"
    );

    // Get metadata for each token (batched)
    const metadataResults = await Promise.allSettled(
      nonZero.map((b) =>
        alchemyRpc("alchemy_getTokenMetadata", [b.contractAddress]) as Promise<{
          name: string;
          symbol: string;
          decimals: number;
          logo?: string;
        }>
      )
    );

    const balances: TokenBalance[] = [];

    for (let i = 0; i < nonZero.length; i++) {
      const rawBalance = nonZero[i];
      const metaResult = metadataResults[i];
      if (metaResult.status !== "fulfilled") continue;
      const meta = metaResult.value;
      if (!meta?.symbol || !meta?.decimals) continue;

      const decimals = meta.decimals;
      const balanceRaw = BigInt(rawBalance.tokenBalance || "0");
      const balanceFormatted = Number(balanceRaw) / 10 ** decimals;

      if (balanceFormatted <= 0) continue;

      balances.push({
        symbol: meta.symbol,
        name: meta.name || meta.symbol,
        contractAddress: rawBalance.contractAddress,
        decimals,
        balanceRaw: rawBalance.tokenBalance,
        balanceFormatted,
        usdPrice: 0, // filled by getTokenUsdPrices
        usdValue: 0,
      });
    }

    // Also add native ETH balance
    const ethBalanceHex = await alchemyRpc("eth_getBalance", [address, "latest"]) as string;
    const ethBalance = Number(BigInt(ethBalanceHex)) / 1e18;
    if (ethBalance > 0) {
      balances.unshift({
        symbol: "ETH",
        name: "Ethereum",
        contractAddress: "",
        decimals: 18,
        balanceRaw: ethBalanceHex,
        balanceFormatted: ethBalance,
        usdPrice: 0,
        usdValue: 0,
      });
    }

    return balances;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`getWalletTokenBalances(${address}) failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 4. getTokenUsdPrices
// ---------------------------------------------------------------------------

const COINGECKO_ID_MAP: Record<string, string> = {
  ETH: "ethereum",
  BTC: "bitcoin",
  SOL: "solana",
  USDC: "usd-coin",
  USDT: "tether",
  OKB: "okb",
  POPCAT: "popcat",
};

async function fetchCoinGeckoPrices(symbols: string[]): Promise<Record<string, number>> {
  const ids = symbols
    .map((s) => COINGECKO_ID_MAP[s.toUpperCase()])
    .filter(Boolean)
    .join(",");

  if (!ids) return {};

  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    { next: { revalidate: 60 } } // cache 60s in Next.js
  );
  if (!res.ok) throw new Error(`CoinGecko API failed: ${res.status}`);

  const data = await res.json() as Record<string, { usd: number }>;
  const prices: Record<string, number> = {};
  for (const sym of symbols) {
    const id = COINGECKO_ID_MAP[sym.toUpperCase()];
    if (id && data[id]?.usd) prices[sym.toUpperCase()] = data[id].usd;
  }
  return prices;
}

export async function getTokenUsdPrices(symbols: string[]): Promise<Record<string, number>> {
  // Try Alchemy Prices API first
  try {
    const upperSymbols = symbols.map((s) => s.toUpperCase());
    const url = `${alchemyPricesUrl()}/tokens/by-symbol?symbols=${upperSymbols.join(",")}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Alchemy Prices API: ${res.status}`);

    const data = await res.json() as {
      data?: { symbol: string; prices?: { value: string; currency: string }[] }[];
    };

    const prices: Record<string, number> = {};
    for (const item of data?.data || []) {
      const usdEntry = item.prices?.find((p) => p.currency === "usd");
      if (usdEntry) prices[item.symbol.toUpperCase()] = parseFloat(usdEntry.value);
    }

    // Fill missing symbols from fallback
    const missing = upperSymbols.filter((s) => !prices[s]);
    if (missing.length > 0) {
      const fallbackPrices = await fetchCoinGeckoPrices(missing);
      Object.assign(prices, fallbackPrices);
    }

    return prices;
  } catch {
    // Alchemy Prices API unavailable – fall back to CoinGecko
    try {
      return await fetchCoinGeckoPrices(symbols);
    } catch (fallbackErr: unknown) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      console.warn(`getTokenUsdPrices: all price APIs failed – ${msg}. Returning empty.`);
      return {};
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: Build whale summaries from raw transfers
// ---------------------------------------------------------------------------

export function buildWhaleSummaries(transfers: AlchemyTransfer[]): WhaleTransferSummary[] {
  const addressMap = new Map<string, WhaleTransferSummary>();

  for (const tx of transfers) {
    const addresses = [tx.from, tx.to].filter(Boolean) as string[];
    for (const addr of addresses) {
      if (!addressMap.has(addr)) {
        addressMap.set(addr, {
          address: addr,
          totalVolumeUsd: 0,
          txCount: 0,
          netFlow: 0,
          sampleTransactions: [],
        });
      }
      const summary = addressMap.get(addr)!;
      summary.txCount++;
      const value = tx.value || 0;
      summary.totalVolumeUsd += value; // crude approximation (ETH units)
      if (addr === tx.from) summary.netFlow -= value;
      if (addr === tx.to) summary.netFlow += value;
      if (summary.sampleTransactions.length < 5) {
        summary.sampleTransactions.push(tx);
      }
    }
  }

  // Return top addresses by volume (>= 10 ETH volume proxy → potential whales)
  return Array.from(addressMap.values())
    .filter((s) => s.totalVolumeUsd >= 10)
    .sort((a, b) => b.totalVolumeUsd - a.totalVolumeUsd)
    .slice(0, 20);
}
