// NOTE: This file runs SERVER-SIDE only (inside API routes).
// Do not import client-only modules here.

// OpenRouter API Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

export type WalletClassification =
  | "Whale"
  | "Active Spender"
  | "Accumulator/Saver"
  | "Suspicious/Scammer"
  | "Retail User";

export type WalletIntent =
  | "Accumulation"
  | "Distribution"
  | "Arbitrage"
  | "Liquidity Provisioning";

export interface ScannerPayload {
  rawLog: string[];
  transactions: any[];
  /** Whether live Alchemy data was used or mock fallback */
  dataSource: "live" | "mock";
}

export interface SievePayload {
  classification: WalletClassification;
  rawLog: string[];
  transactions: any[];
  dataSource: "live" | "mock";
}

export interface IntentPayload {
  classification: WalletClassification;
  intent: WalletIntent;
  rawLog: string[];
  transactions: any[];
  dataSource: "live" | "mock";
}

export interface StrategistPayload {
  classification: WalletClassification;
  intent: WalletIntent;
  rawLog: string[];
  portfolioRecommendation: Record<string, number>;
  currentPortfolio?: Record<string, number>;
  dataSource: "live" | "mock";
}

// Clean markdown code blocks from model JSON responses
function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

// Helper to call OpenRouter completions endpoint
async function callLLM(systemInstruction: string, promptContext: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || OPENROUTER_MODEL;

  if (!apiKey || apiKey === "" || apiKey.includes("your_openrouter_api_key_here")) {
    throw new Error("OpenRouter API key is not configured.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "WhaleWhisper",
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: promptContext }
      ],
      temperature: 0.1,
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API failed with status ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// Generate realistic mock EVM mainnet transactions based on the timeframe
export function generateMockTransactions(timeframe: string): any[] {
  return [
    {
      wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      alias: "Vitalik Buterin (vitalik.eth)",
      action: "WITHDRAW",
      asset: "ETH",
      amount: "250 ETH",
      usdValue: "$850,000",
      timestamp: timeframe === "DAILY" ? "12 mins ago" : timeframe === "WEEKLY" ? "2 days ago" : "12 days ago"
    },
    {
      wallet: "0x176F3DAb24a159341c0509bB36B833E7fdd0a132",
      alias: "Justin Sun (Tron Founder)",
      action: "DEPOSIT",
      asset: "USDT",
      amount: "12,000,000 USDT",
      usdValue: "$12,000,000",
      timestamp: timeframe === "DAILY" ? "28 mins ago" : timeframe === "WEEKLY" ? "1 day ago" : "5 days ago"
    },
    {
      wallet: "0x7056d6428D811d04423a63eb4c360be1c4a03E1e",
      alias: "GCR (Legendary Trader)",
      action: "SWAP",
      asset: "POPCAT",
      amount: "1,500,000 POPCAT",
      usdValue: "$980,000",
      timestamp: timeframe === "DAILY" ? "45 mins ago" : timeframe === "WEEKLY" ? "3 days ago" : "14 days ago"
    },
    {
      wallet: "0x53461E4f60C1F855Bf0241B9cc2455854047a0D6",
      alias: "Arthur Hayes (BitMEX Founder)",
      action: "BUY",
      asset: "SOL",
      amount: "2,500 SOL",
      usdValue: "$360,000",
      timestamp: timeframe === "DAILY" ? "2 hours ago" : timeframe === "WEEKLY" ? "4 days ago" : "18 days ago"
    }
  ];
}

// 1. ScannerAgent
export class ScannerAgent {
  public async execute(
    transactions: any[],
    timeframe: string,
    appUrl?: string
  ): Promise<ScannerPayload> {
    console.log("Executing ScannerAgent...");
    let targetTxs = transactions;
    let dataSource: "live" | "mock" = "live";

    // If no transactions provided, try to fetch live whale data from /api/whales
    if (!targetTxs || targetTxs.length === 0) {
      const baseUrl = appUrl || process.env.APP_URL || "http://localhost:3000";
      try {
        const hoursMap: Record<string, number> = {
          DAILY: 24, WEEKLY: 168, MONTHLY: 720, YEARLY: 8760,
        };
        const sinceHours = hoursMap[timeframe] ?? 24;
        const res = await fetch(`${baseUrl}/api/whales?sinceHours=${sinceHours}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`/api/whales returned ${res.status}`);
        const data = await res.json() as { whales?: any[]; source?: string };
        if (data?.whales && data.whales.length > 0) {
          // Normalize whale API response to internal transaction format
          targetTxs = data.whales.flatMap((whale: any) =>
            (whale.sampleTransactions || []).map((tx: any) => ({
              wallet: whale.address,
              alias: whale.alias || `Whale ${whale.address.slice(0, 8)}...`,
              action: tx.action || "TRANSFER",
              asset: tx.asset || "ETH",
              amount: tx.value != null ? `${tx.value} ${tx.asset || "ETH"}` : "N/A",
              usdValue: `$${(whale.totalVolumeUsd || 0).toLocaleString()}`,
              timestamp: tx.timestamp || "recent",
            }))
          );
          dataSource = data.source === "mock" ? "mock" : "live";
          if (dataSource === "mock") {
            console.warn("⚠ [ScannerAgent] GERÇEK VERİ ALINAMADI – API MOCK VERİ KULLANIYOR");
          } else {
            console.log(`[ScannerAgent] Live Alchemy data loaded: ${targetTxs.length} transactions from ${data.whales.length} whale wallets`);
          }
        } else {
          throw new Error("No whale entries returned");
        }
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.warn(`⚠ [ScannerAgent] GERÇEK VERİ ALINAMADI – MOCK KULLANILIYOR: ${msg}`);
        targetTxs = generateMockTransactions(timeframe);
        dataSource = "mock";
      }
    }

    const rawLog: string[] = targetTxs.map((tx: any) => {
      const wallet = tx.wallet || tx.from?.hash || tx.from || "unknown";
      const alias = tx.alias || "Unknown Whale";
      const action = tx.action || "TRANSFER";
      const asset = tx.asset || "ETH";
      const amount = tx.amount || `${parseFloat(tx.value || "0") / 1e18} ETH`;
      const usdValue = tx.usdValue || "N/A";
      const timestamp = tx.timestamp || "recent";
      return `[${timestamp}] Whale ${alias} (${wallet}) executed ${action} of ${amount} (Value: ${usdValue})`;
    });

    return { rawLog, transactions: targetTxs, dataSource };
  }
}

// 2. SieveAgent
export class SieveAgent {
  public async execute(payload: ScannerPayload): Promise<SievePayload> {
    console.log("Executing SieveAgent...");
    const VALID_CLASSIFICATIONS: WalletClassification[] = [
      "Whale",
      "Active Spender",
      "Accumulator/Saver",
      "Suspicious/Scammer",
      "Retail User",
    ];

    const systemInstruction = `You are the SieveAgent, a hardened forensic blockchain investigator.
Evaluate the provided transaction logs and classify the primary wallet behavior.
Choose EXACTLY ONE from the following 5 categories:
- "Whale": Large-volume, market-moving transactions above $100K USD.
- "Active Spender": Frequent, high-frequency transactions; buying and selling across DeFi protocols.
- "Accumulator/Saver": Consistently buying and holding, low sell activity, building a long-term position.
- "Suspicious/Scammer": Irregular patterns, mixer usage, rapid deposit-withdraw cycles, rug-pull-like movements.
- "Retail User": Small, sporadic transactions with no clear large-scale strategy.

Output your response strictly as a JSON object:
{ "classification": "Whale" | "Active Spender" | "Accumulator/Saver" | "Suspicious/Scammer" | "Retail User" }`;

    const promptContext = `Transaction Logs:\n${payload.rawLog.join("\n")}`;

    try {
      const response = await callLLM(systemInstruction, promptContext);
      const cleaned = cleanJsonResponse(response);
      const parsed = JSON.parse(cleaned);
      const raw = parsed.classification;
      const classification: WalletClassification = VALID_CLASSIFICATIONS.includes(raw) ? raw : "Whale";
      return {
        classification,
        rawLog: payload.rawLog,
        transactions: payload.transactions,
        dataSource: payload.dataSource,
      };
    } catch (err) {
      console.warn("SieveAgent failed or key missing, using rule-based classification fallback:", err);

      // Rule-based 5-category fallback
      let classification: WalletClassification = "Retail User";
      const totalUsd = payload.transactions.reduce((sum, tx) => {
        const usdStr = (tx.usdValue || "").replace(/[$,]/g, "");
        const val = parseFloat(usdStr);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
      const txCount = payload.transactions.length;
      const sells = payload.transactions.filter(tx => {
        const a = (tx.action || "").toUpperCase();
        return a.includes("SELL") || a.includes("WITHDRAW");
      }).length;
      const buys = payload.transactions.filter(tx => {
        const a = (tx.action || "").toUpperCase();
        return a.includes("BUY") || a.includes("DEPOSIT");
      }).length;

      if (totalUsd >= 100_000) {
        classification = "Whale";
      } else if (txCount >= 8 && sells > buys * 1.5) {
        classification = "Suspicious/Scammer";
      } else if (txCount >= 5 && sells > buys) {
        classification = "Active Spender";
      } else if (buys > sells * 1.5) {
        classification = "Accumulator/Saver";
      }

      return {
        classification,
        rawLog: payload.rawLog,
        transactions: payload.transactions,
        dataSource: payload.dataSource,
      };
    }
  }
}

// 3. IntentAgent
export class IntentAgent {
  public async execute(payload: SievePayload): Promise<IntentPayload> {
    console.log("Executing IntentAgent...");
    const VALID_INTENTS: WalletIntent[] = [
      "Accumulation", "Distribution", "Arbitrage", "Liquidity Provisioning",
    ];

    const systemInstruction = `You are the IntentAgent, a behavioral market psychologist.
Analyze the transaction logs and wallet classification to decipher the primary objective or intent.
Note: Payment fees run on X Layer Testnet (Chain ID: 195) using OKB. Analytical data comes from Ethereum Mainnet.
Select EXACTLY one intent: "Accumulation", "Distribution", "Arbitrage", or "Liquidity Provisioning".
Output strictly as JSON:
{ "intent": "Accumulation" | "Distribution" | "Arbitrage" | "Liquidity Provisioning" }`;

    const promptContext = `Wallet Classification: ${payload.classification}\nTransaction Logs:\n${payload.rawLog.join("\n")}`;

    try {
      const response = await callLLM(systemInstruction, promptContext);
      const cleaned = cleanJsonResponse(response);
      const parsed = JSON.parse(cleaned);
      const raw = parsed.intent;
      const intent: WalletIntent = VALID_INTENTS.includes(raw) ? raw : "Accumulation";
      return {
        classification: payload.classification,
        intent,
        rawLog: payload.rawLog,
        transactions: payload.transactions,
        dataSource: payload.dataSource,
      };
    } catch (err) {
      console.warn("IntentAgent failed or key missing, using rule-based intent fallback:", err);

      let intent: WalletIntent = "Accumulation";
      let sells = 0, buys = 0, swaps = 0;

      payload.transactions.forEach((tx: any) => {
        const action = (tx.action || "").toUpperCase();
        if (action.includes("SELL") || action.includes("WITHDRAW")) sells++;
        else if (action.includes("BUY") || action.includes("DEPOSIT")) buys++;
        else if (action.includes("SWAP")) swaps++;
      });

      if (sells > buys && sells > swaps) intent = "Distribution";
      else if (swaps > buys && swaps > sells) intent = "Arbitrage";

      return {
        classification: payload.classification,
        intent,
        rawLog: payload.rawLog,
        transactions: payload.transactions,
        dataSource: payload.dataSource,
      };
    }
  }
}

// 4. StrategistAgent
export class StrategistAgent {
  public async execute(
    payload: IntentPayload,
    riskProfile: string,
    timeframe: string,
    currentPortfolio?: Record<string, number>
  ): Promise<StrategistPayload> {
    console.log("Executing StrategistAgent...");
    const currentPortfolioStr = currentPortfolio && Object.keys(currentPortfolio).length > 0
      ? `\nUser's CURRENT on-chain portfolio (USD %): ${JSON.stringify(currentPortfolio)}\nFactor this in — recommend deltas that move toward the optimized allocation.`
      : "";

    const systemInstruction = `You are the StrategistAgent, a quantitative crypto portfolio strategist.
Consolidate the findings (Wallet Classification: ${payload.classification}, Intended Goal: ${payload.intent}) and generate an optimized portfolio allocation recommendation based on the user's risk profile (${riskProfile}) and timeframe (${timeframe}).
Note: Payment fees run on X Layer Testnet (Chain ID: 195). Analytical data comes from Ethereum Mainnet.${currentPortfolioStr}

Strict Whitelist Constraint:
You are strictly forbidden from recommending ANY token ticker outside of this explicit whitelist: [OKB, BTC, ETH, SOL, POPCAT, USDC, USDT]. Every portfolio allocation recommendation output must sum up to exactly 100% using only these 7 asset choices. Do not invent or include any other tokens under any circumstances.

Output your response strictly as a JSON object containing:
{
  "portfolioRecommendation": {
    "BTC": number,
    "ETH": number,
    "SOL": number,
    "POPCAT": number,
    "USDC": number,
    "USDT": number,
    "OKB": number
  }
}`;

    const promptContext = `Classification: ${payload.classification}\nIntent: ${payload.intent}\nLogs:\n${payload.rawLog.join("\n")}`;

    try {
      const response = await callLLM(systemInstruction, promptContext);
      const cleaned = cleanJsonResponse(response);
      const parsed = JSON.parse(cleaned);
      return {
        classification: payload.classification,
        intent: payload.intent,
        rawLog: payload.rawLog,
        portfolioRecommendation: parsed.portfolioRecommendation || { "BTC": 40, "SOL": 30, "ETH": 20, "USDC": 10 },
        currentPortfolio,
        dataSource: payload.dataSource,
      };
    } catch (err) {
      console.warn("StrategistAgent failed or key missing, using rule-based portfolio allocation fallback:", err);

      // Rule-based fallback portfolio allocation
      let portfolioRecommendation: Record<string, number> = { "BTC": 40, "SOL": 30, "ETH": 20, "USDC": 10 };
      
      if (riskProfile === "DEGEN") {
        portfolioRecommendation = { "SOL": 45, "POPCAT": 30, "USDT": 15, "USDC": 10 };
      } else if (riskProfile === "DEFENSIVE") {
        portfolioRecommendation = { "USDC": 50, "BTC": 30, "ETH": 15, "OKB": 5 };
      }

      // Tweak based on intent
      if (payload.intent === "Distribution" && portfolioRecommendation["USDC"] !== undefined) {
        // Shift 10% to stables for safety
        const volatileAsset = Object.keys(portfolioRecommendation).find(k => k !== "USDC");
        if (volatileAsset) {
          portfolioRecommendation[volatileAsset] = Math.max(0, portfolioRecommendation[volatileAsset] - 10);
          portfolioRecommendation["USDC"] += 10;
        }
      } else if (payload.intent === "Accumulation" && portfolioRecommendation["USDC"] !== undefined) {
        // Shift 10% from stables to volatile asset
        const volatileAsset = Object.keys(portfolioRecommendation).find(k => k !== "USDC");
        if (volatileAsset && portfolioRecommendation["USDC"] >= 10) {
          portfolioRecommendation[volatileAsset] += 10;
          portfolioRecommendation["USDC"] -= 10;
        }
      }

      return {
        classification: payload.classification,
        intent: payload.intent,
        rawLog: payload.rawLog,
        portfolioRecommendation,
        currentPortfolio,
        dataSource: payload.dataSource,
      };
    }
  }
}

// Core Orchestration Agent Interface
export class WhaleWhisperAgent {
  public async analyze(
    userMessage: string,
    forceRiskProfile?: "DEGEN" | "BALANCED" | "DEFENSIVE",
    timeframe: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" = "DAILY",
    transactions?: any[] | null,
    currentPortfolio?: Record<string, number>,
    appUrl?: string
  ): Promise<string> {
    
    // Determine risk profile
    let riskProfile = forceRiskProfile || "BALANCED";
    const queryLower = userMessage.toLowerCase();
    if (queryLower.includes("degen") || queryLower.includes("high risk") || queryLower.includes("shitcoin") || queryLower.includes("meme")) {
      riskProfile = "DEGEN";
    } else if (queryLower.includes("defensive") || queryLower.includes("safe") || queryLower.includes("low risk") || queryLower.includes("yield")) {
      riskProfile = "DEFENSIVE";
    }

    try {
      const scanner = new ScannerAgent();
      const sieve = new SieveAgent();
      const intent = new IntentAgent();
      const strategist = new StrategistAgent();

      // Sequential execution sequence
      const scannerPayload = await scanner.execute(transactions || [], timeframe, appUrl);
      const sievePayload = await sieve.execute(scannerPayload);
      const intentPayload = await intent.execute(sievePayload);
      const finalPayload = await strategist.execute(intentPayload, riskProfile, timeframe, currentPortfolio);

      // Return output strictly as a clean structured JSON stringified object
      return JSON.stringify({
        classification: finalPayload.classification,
        intent: finalPayload.intent,
        rawLog: finalPayload.rawLog,
        portfolioRecommendation: finalPayload.portfolioRecommendation,
        currentPortfolio: finalPayload.currentPortfolio,
        dataSource: finalPayload.dataSource,
      }, null, 2);

    } catch (err: any) {
      console.error("Multi-Agent pipeline crashed. Using local fallback dispatcher:", err);
      return this.localPipelineFallback(riskProfile, timeframe, transactions || []);
    }
  }

  private localPipelineFallback(riskProfile: string, timeframe: string, transactions: any[]): string {
    const mockTxs = transactions.length > 0 ? transactions : generateMockTransactions(timeframe);
    const rawLog = mockTxs.map(tx => {
      const wallet = tx.wallet || tx.from?.hash || tx.from || "unknown";
      const alias = tx.alias || "Unknown Whale";
      const action = tx.action || "TRANSFER";
      const asset = tx.asset || "ETH";
      const amount = tx.amount || "0";
      const usdValue = tx.usdValue || "N/A";
      const timestamp = tx.timestamp || "recent";
      return `[${timestamp}] Whale ${alias} (${wallet}) executed ${action} of ${amount} (Value: ${usdValue})`;
    });

    let portfolioRecommendation: Record<string, number> = { "BTC": 40, "SOL": 30, "ETH": 20, "USDC": 10 };
    let classification: SievePayload["classification"] = "Whale";
    let intent: IntentPayload["intent"] = "Accumulation";

    if (riskProfile === "DEGEN") {
      portfolioRecommendation = { "SOL": 45, "POPCAT": 30, "USDT": 15, "USDC": 10 };
      intent = "Arbitrage";
    } else if (riskProfile === "DEFENSIVE") {
      portfolioRecommendation = { "USDC": 50, "BTC": 30, "ETH": 15, "OKB": 5 };
      classification = "Whale";
      intent = "Distribution";
    }

    return JSON.stringify({
      classification,
      intent,
      rawLog,
      portfolioRecommendation
    }, null, 2);
  }
}
