import { privateKeyToAccount } from "viem/accounts";

// OpenRouter API Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

export interface ScannerPayload {
  rawLog: string[];
  transactions: any[];
}

export interface SievePayload {
  classification: "Whale" | "Suspicious Mixer/Launderer" | "Retail User";
  rawLog: string[];
  transactions: any[];
}

export interface IntentPayload {
  classification: "Whale" | "Suspicious Mixer/Launderer" | "Retail User";
  intent: "Accumulation" | "Distribution" | "Arbitrage" | "Liquidity Provisioning";
  rawLog: string[];
  transactions: any[];
}

export interface StrategistPayload {
  classification: "Whale" | "Suspicious Mixer/Launderer" | "Retail User";
  intent: "Accumulation" | "Distribution" | "Arbitrage" | "Liquidity Provisioning";
  rawLog: string[];
  portfolioRecommendation: Record<string, number>;
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
  public async execute(transactions: any[], timeframe: string): Promise<ScannerPayload> {
    console.log("Executing ScannerAgent...");
    let targetTxs = transactions;
    if (!targetTxs || targetTxs.length === 0) {
      console.log("No transactions provided. Using high-fidelity mock mainnet transactions generator.");
      targetTxs = generateMockTransactions(timeframe);
    }

    const rawLog: string[] = targetTxs.map(tx => {
      const wallet = tx.wallet || tx.from?.hash || tx.from || "unknown";
      const alias = tx.alias || "Unknown Whale";
      const action = tx.action || "TRANSFER";
      const asset = tx.asset || "ETH";
      const amount = tx.amount || `${parseFloat(tx.value || "0") / 1e18} ETH`;
      const usdValue = tx.usdValue || "N/A";
      const timestamp = tx.timestamp || "recent";
      return `[${timestamp}] Whale ${alias} (${wallet}) executed ${action} of ${amount} (Value: ${usdValue})`;
    });

    return { rawLog, transactions: targetTxs };
  }
}

// 2. SieveAgent
export class SieveAgent {
  public async execute(payload: ScannerPayload): Promise<SievePayload> {
    console.log("Executing SieveAgent...");
    const systemInstruction = `You are the SieveAgent, a hardened forensic blockchain investigator.
Evaluate the provided transaction logs and determine if the wallet activities represent a "Whale", a "Suspicious Mixer/Launderer", or a "Retail User".
Provide EXACTLY one classification from the list.
Output your response strictly as a JSON object containing:
{
  "classification": "Whale" | "Suspicious Mixer/Launderer" | "Retail User"
}`;

    const promptContext = `Transaction Logs:\n${payload.rawLog.join("\n")}`;

    try {
      const response = await callLLM(systemInstruction, promptContext);
      const cleaned = cleanJsonResponse(response);
      const parsed = JSON.parse(cleaned);
      const classification = parsed.classification || "Whale";
      return {
        classification: (["Whale", "Suspicious Mixer/Launderer", "Retail User"].includes(classification) ? classification : "Whale") as any,
        rawLog: payload.rawLog,
        transactions: payload.transactions
      };
    } catch (err) {
      console.warn("SieveAgent failed or key missing, using rule-based classification fallback:", err);
      
      // Rule-based fallback classification
      let classification: SievePayload["classification"] = "Retail User";
      const hasLargeValue = payload.transactions.some(tx => {
        const usdStr = (tx.usdValue || "").replace(/[$,]/g, "");
        const usdVal = parseFloat(usdStr);
        return !isNaN(usdVal) && usdVal >= 100000;
      });
      const highFrequency = payload.transactions.length >= 8;

      if (hasLargeValue) {
        classification = "Whale";
      } else if (highFrequency) {
        classification = "Suspicious Mixer/Launderer";
      }

      return {
        classification,
        rawLog: payload.rawLog,
        transactions: payload.transactions
      };
    }
  }
}

// 3. IntentAgent
export class IntentAgent {
  public async execute(payload: SievePayload): Promise<IntentPayload> {
    console.log("Executing IntentAgent...");
    const systemInstruction = `You are the IntentAgent, a behavioral market psychologist.
Analyze the transaction logs and wallet classification to decipher the primary objective or intent of the wallet movements.
Select EXACTLY one intent: "Accumulation", "Distribution", "Arbitrage", or "Liquidity Provisioning".
Output your response strictly as a JSON object containing:
{
  "intent": "Accumulation" | "Distribution" | "Arbitrage" | "Liquidity Provisioning"
}`;

    const promptContext = `Wallet Classification: ${payload.classification}\nTransaction Logs:\n${payload.rawLog.join("\n")}`;

    try {
      const response = await callLLM(systemInstruction, promptContext);
      const cleaned = cleanJsonResponse(response);
      const parsed = JSON.parse(cleaned);
      const intent = parsed.intent || "Accumulation";
      return {
        classification: payload.classification,
        intent: (["Accumulation", "Distribution", "Arbitrage", "Liquidity Provisioning"].includes(intent) ? intent : "Accumulation") as any,
        rawLog: payload.rawLog,
        transactions: payload.transactions
      };
    } catch (err) {
      console.warn("IntentAgent failed or key missing, using rule-based intent fallback:", err);
      
      // Rule-based fallback intent
      let intent: IntentPayload["intent"] = "Accumulation";
      let sells = 0;
      let buys = 0;
      let swaps = 0;

      payload.transactions.forEach(tx => {
        const action = (tx.action || "").toUpperCase();
        if (action.includes("SELL") || action.includes("WITHDRAW")) sells++;
        else if (action.includes("BUY") || action.includes("DEPOSIT")) buys++;
        else if (action.includes("SWAP")) swaps++;
      });

      if (sells > buys && sells > swaps) intent = "Distribution";
      else if (swaps > buys && swaps > sells) intent = "Arbitrage";
      else if (buys >= sells) intent = "Accumulation";

      return {
        classification: payload.classification,
        intent,
        rawLog: payload.rawLog,
        transactions: payload.transactions
      };
    }
  }
}

// 4. StrategistAgent
export class StrategistAgent {
  public async execute(payload: IntentPayload, riskProfile: string, timeframe: string): Promise<StrategistPayload> {
    console.log("Executing StrategistAgent...");
    const systemInstruction = `You are the StrategistAgent, a quantitative crypto portfolio strategist.
Consolidate the findings (Wallet Classification: ${payload.classification}, Intended Goal: ${payload.intent}) and generate an optimized portfolio allocation recommendation based on the user's risk profile (${riskProfile}) and timeframe (${timeframe}).
Output your response strictly as a JSON object containing:
{
  "portfolioRecommendation": {
    "BTC": number,
    "SOL": number,
    "ETH": number,
    "USDC": number,
    ...
  }
}
Note: The sum of all asset percentages in portfolioRecommendation must equal exactly 100. Limit the assets to top tokens like BTC, ETH, SOL, USDC, and trending meme/utility tokens populating the transaction logs.`;

    const promptContext = `Classification: ${payload.classification}\nIntent: ${payload.intent}\nLogs:\n${payload.rawLog.join("\n")}`;

    try {
      const response = await callLLM(systemInstruction, promptContext);
      const cleaned = cleanJsonResponse(response);
      const parsed = JSON.parse(cleaned);
      return {
        classification: payload.classification,
        intent: payload.intent,
        rawLog: payload.rawLog,
        portfolioRecommendation: parsed.portfolioRecommendation || { "BTC": 40, "SOL": 30, "ETH": 20, "USDC": 10 }
      };
    } catch (err) {
      console.warn("StrategistAgent failed or key missing, using rule-based portfolio allocation fallback:", err);

      // Rule-based fallback portfolio allocation
      let portfolioRecommendation: Record<string, number> = { "BTC": 40, "SOL": 30, "ETH": 20, "USDC": 10 };
      
      if (riskProfile === "DEGEN") {
        portfolioRecommendation = { "SOL": 45, "POPCAT": 30, "WIF": 15, "USDC": 10 };
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
        portfolioRecommendation
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
    transactions?: any[] | null
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
      const scannerPayload = await scanner.execute(transactions || [], timeframe);
      const sievePayload = await sieve.execute(scannerPayload);
      const intentPayload = await intent.execute(sievePayload);
      const finalPayload = await strategist.execute(intentPayload, riskProfile, timeframe);

      // Return output strictly as a clean structured JSON stringified object
      return JSON.stringify({
        classification: finalPayload.classification,
        intent: finalPayload.intent,
        rawLog: finalPayload.rawLog,
        portfolioRecommendation: finalPayload.portfolioRecommendation
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
      portfolioRecommendation = { "SOL": 45, "POPCAT": 30, "WIF": 15, "USDC": 10 };
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
