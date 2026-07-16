"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  Wallet,
  Coins,
  Shield,
  Activity,
  Cpu,
  RotateCcw,
  Lock,
  ArrowUpRight,
  Terminal
} from "lucide-react";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { x402Client, wrapFetchWithPayment } from "@okxweb3/x402-fetch";
import { registerExactEvmScheme } from "@okxweb3/x402-evm/exact/client";

interface Message {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
  riskProfile?: "DEGEN" | "BALANCED" | "DEFENSIVE";
  paymentDetails?: {
    txHash?: string;
    amount: string;
    network: string;
    scheme: string;
  };
}

interface LogEntry {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: string;
}

export default function Home() {
  // Tabs state
  const [activeTab, setActiveTab] = useState<"dashboard" | "chat">("dashboard");

  // Timeframe and Whale state
  const [trackedWallets, setTrackedWallets] = useState<string[]>([
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", // Vitalik
    "0x176F3DAb24a159341c0509bB36B833E7fdd0a132"  // Justin Sun
  ]);
  const [forceSandboxSign, setForceSandboxSign] = useState<boolean>(true);
  const [selectedPortfolio, setSelectedPortfolio] = useState<"DEGEN" | "BALANCED" | "DEFENSIVE" | null>(null);
  const [activeAllocation, setActiveAllocation] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);

  // Wallet state
  const [walletType, setWalletType] = useState<"none" | "sandbox" | "real">("none");
  const [address, setAddress] = useState<string>("");
  const [balance, setBalance] = useState<string>("0.00");
  const [isConnecting, setIsConnecting] = useState(false);

  // Chat state
  const [input, setInput] = useState("");
  const [riskProfile, setRiskProfile] = useState<"DEGEN" | "BALANCED" | "DEFENSIVE">("BALANCED");
  const [timeframe, setTimeframe] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY">("DAILY");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "agent",
      text: "WhaleWhisper protocol initialized. Connect wallet and specify your risk appetite to receive blunt, data-backed portfolio allocations.",
      timestamp: ""
    }
  ]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Terminal Logs for demonstration
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "log-1",
      type: "info",
      message: "WhaleWhisper ASP v2.0 listening on port 3000.",
      timestamp: ""
    },
    {
      id: "log-2",
      type: "info",
      message: "OKX x402 EVM Payment Module bound to eip155:196 (X Layer).",
      timestamp: ""
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const deploymentLogsEndRef = useRef<HTMLDivElement>(null);

  // Markdown renderer utility
  const renderMarkdown = (text: string) => {
    const lines = text.split("\n");
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    return lines.map((line, idx) => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith("|")) {
        const parts = trimmed.split("|").map(p => p.trim()).filter((p, i, a) => i > 0 && i < a.length - 1);
        if (trimmed.includes("---")) {
          return null;
        }
        if (!inTable) {
          inTable = true;
          tableHeaders = parts;
          return null;
        } else {
          tableRows.push(parts);
          const nextLine = lines[idx + 1];
          if (!nextLine || !nextLine.trim().startsWith("|")) {
            inTable = false;
            const rows = [...tableRows];
            tableRows = [];
            return (
              <div key={`table-${idx}`} className="overflow-x-auto my-4 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <table className="min-w-full divide-y divide-black font-mono text-xs">
                  <thead className="bg-zinc-100">
                    <tr>
                      {tableHeaders.map((h, i) => (
                        <th key={i} className="px-4 py-2 border-r border-black font-bold text-left last:border-r-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black bg-white">
                    {rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-4 py-2 border-r border-black last:border-r-0">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          return null;
        }
      }

      if (trimmed.startsWith("###")) {
        return <h4 key={idx} className="text-xs font-black uppercase tracking-wider mt-4 mb-2 font-mono border-b border-zinc-200 pb-1 text-black">{trimmed.replace(/###/g, "").trim()}</h4>;
      }
      if (trimmed.startsWith("##")) {
        return <h3 key={idx} className="text-sm font-black uppercase tracking-wider mt-5 mb-2 font-mono border-b border-black pb-1 text-black">{trimmed.replace(/##/g, "").trim()}</h3>;
      }
      if (trimmed.startsWith("#")) {
        return <h2 key={idx} className="text-base font-black uppercase tracking-wider mt-6 mb-3 font-mono text-black">{trimmed.replace(/#/g, "").trim()}</h2>;
      }

      if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        return <li key={idx} className="text-xs list-disc list-inside ml-4 my-1 text-zinc-800 font-mono">{trimmed.substring(1).trim()}</li>;
      }

      if (trimmed === "") return <div key={idx} className="h-2"></div>;

      return <p key={idx} className="text-xs leading-relaxed text-zinc-800 my-1 font-mono">{trimmed}</p>;
    }).filter(el => el !== null);
  };

  // Scroll utilities
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    // Scroll deployment logs if active
    deploymentLogsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [deploymentLogs, isDeploying]);

  useEffect(() => {
    // Populate client-side timestamps on mount to prevent hydration mismatch
    const clientTime = new Date().toLocaleTimeString();
    setMessages(prev => prev.map(m => m.id === "welcome" ? { ...m, timestamp: clientTime } : m));
    setLogs(prev => prev.map(l => l.id.startsWith("log-") ? { ...l, timestamp: clientTime } : l));
  }, []);

  // Add terminal log helper
  const addLog = (message: string, type: "info" | "success" | "warning" | "error" = "info") => {
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random()}`,
        type,
        message,
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
  };

  // Setup / Restore Sandbox Wallet
  const connectSandbox = () => {
    setIsConnecting(true);
    addLog("Initializing local sandbox secure keypair...", "info");
    
    setTimeout(() => {
      let privKey = localStorage.getItem("whisper_sandbox_pk");
      if (!privKey) {
        privKey = generatePrivateKey();
        localStorage.setItem("whisper_sandbox_pk", privKey);
      }
      
      try {
        const account = privateKeyToAccount(privKey as `0x${string}`);
        setAddress(account.address);
        setWalletType("sandbox");
        setBalance("10.00"); // Pre-fund simulation
        addLog(`Sandbox wallet instantiated: ${account.address}`, "success");
        addLog("Pre-funded with $10.00 mock USDC on eip155:196.", "success");
      } catch (err: any) {
        addLog(`Failed to create sandbox wallet: ${err.message}`, "error");
      } finally {
        setIsConnecting(false);
      }
    }, 800);
  };

  // Connect Real Extension Wallet (OKX / Metamask)
  const connectReal = async () => {
    if (typeof window === "undefined") return;
    setIsConnecting(true);
    addLog("Detecting injected Web3 wallet...", "info");

    const eth = (window as any).ethereum;
    if (!eth) {
      addLog("No injected Web3 Wallet detected. Please install OKX Web3 Wallet.", "error");
      setIsConnecting(false);
      return;
    }

    try {
      addLog("Requesting wallet connection...", "info");
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) {
        setAddress(accounts[0]);
        setWalletType("real");
        setBalance("0.50"); // Mock balance for demonstration
        addLog(`Connected browser wallet: ${accounts[0]}`, "success");
      } else {
        addLog("Wallet connection rejected by user.", "warning");
      }
    } catch (err: any) {
      addLog(`Wallet connection error: ${err.message}`, "error");
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setWalletType("none");
    setAddress("");
    setBalance("0.00");
    addLog("Wallet session disconnected.", "warning");
  };

  // Send query & handle X402 payment flow
  const sendMessage = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    
    const userText = customText || input;
    if (!userText.trim() || isGenerating) return;

    if (walletType === "none") {
      addLog("Authentication failed: You must connect a wallet to authorize payment headers.", "error");
      alert("Please connect a wallet first (Sandbox or Real) to authorize the OKX payment protocol.");
      return;
    }

    if (!customText) {
      setInput("");
    }
    setIsGenerating(true);

    // 1. Append user message to log
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        sender: "user",
        text: userText,
        timestamp: new Date().toLocaleTimeString(),
        riskProfile
      }
    ]);

    addLog(`Initiating portfolio request for [${riskProfile}] profile over [${timeframe}] timeframe...`, "info");

    try {
      // 2. Prepare X402 Client with the appropriate signer
      let signerAccount;
      if (walletType === "sandbox" || forceSandboxSign) {
        let pk = localStorage.getItem("whisper_sandbox_pk");
        if (!pk) {
          pk = generatePrivateKey();
          localStorage.setItem("whisper_sandbox_pk", pk);
        }
        signerAccount = privateKeyToAccount(pk as `0x${string}`);
      } else {
        // Mock account wrapper for injected browser provider
        signerAccount = {
          address: address as `0x${string}`,
          signMessage: async ({ message }: { message: any }) => {
            const eth = (window as any).ethereum;
            return await eth.request({
              method: "personal_sign",
              params: [message, address]
            });
          }
        };
      }

      if (!signerAccount) {
        throw new Error("Unable to construct EVM cryptographic signer.");
      }

      // Instantiate x402Client and register the EVM scheme client
      const client = new x402Client();
      registerExactEvmScheme(client, { signer: signerAccount as any });

      // Build payment-wrapped fetch
      const fetchWithPay = wrapFetchWithPayment(fetch, client);

      // Simulate step-by-step headers logs for transparency
      addLog("Sending POST to /api/agent...", "info");
      
      // Step A: First attempt (will prompt 402 if unpaid, client will auto-pay & retry)
      addLog("Server responded: [402 Payment Required]", "warning");
      addLog("WWW-Authenticate header detected. x402: scheme='exact' network='eip155:196' price='$0.01'.", "info");
      addLog("Prompting wallet signature authorization for $0.01 USDC...", "info");

      // Wrap the fetch call
      const response = await fetchWithPay("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: userText,
          riskProfile: riskProfile,
          timeframe: timeframe
        })
      });

      if (response.status === 200) {
        addLog("Payment validation passed. OKX x402 settlement validated by resource server.", "success");
        addLog("Transaction settled! Authorization: x402-token verification success.", "success");
        
        // Deduct simulated balance if sandbox
        if (walletType === "sandbox") {
          setBalance((prev) => (parseFloat(prev) - 0.01).toFixed(2));
        }

        const data = await response.json();
        
        // Append Agent Response
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            sender: "agent",
            text: data.analysis || "Analysis received, but no content was returned.",
            timestamp: new Date().toLocaleTimeString(),
            paymentDetails: {
              amount: "$0.01 USDC",
              network: "eip155:196 (X Layer)",
              scheme: "exact-evm"
            }
          }
        ]);
        addLog("WhaleWhisper analysis compiled & rendered.", "success");
      } else {
        const errText = await response.text();
        addLog(`Resource server rejected request: ${errText}`, "error");
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-error-${Date.now()}`,
            sender: "agent",
            text: `Payment protocol handshake failed. ${errText || "Please retry."}`,
            timestamp: new Date().toLocaleTimeString()
          }
        ]);
      }
    } catch (err: any) {
      console.error(err);
      addLog(`Payment/Agent execution failed: ${err.message}`, "error");
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-err-${Date.now()}`,
          sender: "agent",
          text: `An error occurred during cryptographic signature or routing: ${err.message}`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Pre-configured allocation portfolios mapping to our live strategy Matrix
  const getPortfolioAllocations = () => {
    switch (riskProfile) {
      case "DEGEN":
        return [
          { token: "SOL", ratio: "60%" },
          { token: "POPCAT", ratio: "30%" },
          { token: "USDC", ratio: "10%" }
        ];
      case "DEFENSIVE":
        return [
          { token: "USDC", ratio: "70%" },
          { token: "SOL", ratio: "20%" },
          { token: "ETH", ratio: "10%" }
        ];
      case "BALANCED":
      default:
        return [
          { token: "SOL", ratio: "40%" },
          { token: "BTC", ratio: "40%" },
          { token: "ETH", ratio: "20%" }
        ];
    }
  };

  const whaleList = [
    { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", alias: "Vitalik Buterin", avatar: "VB", details: "Ethereum Founder, moves large chunks of ETH/ERC20 to exchanges." },
    { address: "0x176F3DAb24a159341c0509bB36B833E7fdd0a132", alias: "Justin Sun", avatar: "JS", details: "Tron Founder, heavy stablecoin minting and staking operations." },
    { address: "0x53461E4f60C1F855Bf0241B9cc2455854047a0D6", alias: "Arthur Hayes", avatar: "AH", details: "BitMEX Founder, accumulates mid-caps and high-growth L1 alts." },
    { address: "0x7056d6428D811d04423a63eb4c360be1c4a03E1e", alias: "GCR (Legendary)", avatar: "GCR", details: "Top-tier trader, rotates heavily into leading ecosystem memes." },
    { address: "0xe8c8441E95122FCE412850f443C78B96603a110D", alias: "Andrew Kang", avatar: "AK", details: "Mechanism Capital partner, specializes in high-conviction momentum plays." }
  ];

  const getWhaleTransactions = () => {
    const allTxs = [
      {
        wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        alias: "Vitalik Buterin",
        action: "WITHDRAW",
        asset: "ETH",
        amount: timeframe === "DAILY" ? "250 ETH" : timeframe === "WEEKLY" ? "1,300 ETH" : timeframe === "MONTHLY" ? "5,600 ETH" : "33,000 ETH",
        usdValue: timeframe === "DAILY" ? "$480K" : timeframe === "WEEKLY" ? "$2.5M" : timeframe === "MONTHLY" ? "$10.8M" : "$63M",
        timestamp: timeframe === "DAILY" ? "12 mins ago" : timeframe === "WEEKLY" ? "2 days ago" : timeframe === "MONTHLY" ? "12 days ago" : "2 months ago"
      },
      {
        wallet: "0x176F3DAb24a159341c0509bB36B833E7fdd0a132",
        alias: "Justin Sun",
        action: "DEPOSIT",
        asset: "USDT",
        amount: timeframe === "DAILY" ? "12M USDT" : timeframe === "WEEKLY" ? "62M USDT" : timeframe === "MONTHLY" ? "270M USDT" : "1.6B USDT",
        usdValue: timeframe === "DAILY" ? "$12.0M" : timeframe === "WEEKLY" ? "$62.0M" : timeframe === "MONTHLY" ? "$270.0M" : "$1.6B",
        timestamp: timeframe === "DAILY" ? "28 mins ago" : timeframe === "WEEKLY" ? "1 day ago" : timeframe === "MONTHLY" ? "5 days ago" : "1 month ago"
      },
      {
        wallet: "0x53461E4f60C1F855Bf0241B9cc2455854047a0D6",
        alias: "Arthur Hayes",
        action: "BUY",
        asset: "SOL",
        amount: timeframe === "DAILY" ? "2,500 SOL" : timeframe === "WEEKLY" ? "13,000 SOL" : timeframe === "MONTHLY" ? "56,000 SOL" : "330,000 SOL",
        usdValue: timeframe === "DAILY" ? "$360K" : timeframe === "WEEKLY" ? "$1.9M" : timeframe === "MONTHLY" ? "$8.1M" : "$48M",
        timestamp: timeframe === "DAILY" ? "2 hours ago" : timeframe === "WEEKLY" ? "4 days ago" : timeframe === "MONTHLY" ? "18 days ago" : "5 months ago"
      },
      {
        wallet: "0x7056d6428D811d04423a63eb4c360be1c4a03E1e",
        alias: "GCR (Legendary)",
        action: "SWAP",
        asset: "POPCAT",
        amount: timeframe === "DAILY" ? "1.5M POPCAT" : timeframe === "WEEKLY" ? "7.8M POPCAT" : timeframe === "MONTHLY" ? "33M POPCAT" : "200M POPCAT",
        usdValue: timeframe === "DAILY" ? "$970K" : timeframe === "WEEKLY" ? "$5.1M" : timeframe === "MONTHLY" ? "$21M" : "$130M",
        timestamp: timeframe === "DAILY" ? "45 mins ago" : timeframe === "WEEKLY" ? "3 days ago" : timeframe === "MONTHLY" ? "14 days ago" : "3 months ago"
      },
      {
        wallet: "0xe8c8441E95122FCE412850f443C78B96603a110D",
        alias: "Andrew Kang",
        action: "SWAP",
        asset: "WIF",
        amount: timeframe === "DAILY" ? "450K WIF" : timeframe === "WEEKLY" ? "2.3M WIF" : timeframe === "MONTHLY" ? "10M WIF" : "60M WIF",
        usdValue: timeframe === "DAILY" ? "$830K" : timeframe === "WEEKLY" ? "$4.2M" : timeframe === "MONTHLY" ? "$18M" : "$110M",
        timestamp: timeframe === "DAILY" ? "4 hours ago" : timeframe === "WEEKLY" ? "2 days ago" : timeframe === "MONTHLY" ? "8 days ago" : "2 months ago"
      }
    ];
    return allTxs.filter(tx => trackedWallets.includes(tx.wallet));
  };

  const generateTimeframePortfolio = () => {
    if (isGenerating) return;
    const trackedNames = whaleList.filter(w => trackedWallets.includes(w.address)).map(w => w.alias).join(", ");
    const prompt = `Analyze whale movements over the last ${timeframe.toLowerCase()} for the following tracked wallets: ${trackedNames || "None"}. Provide a portfolio allocation for a ${riskProfile} profile.`;
    sendMessage(undefined, prompt);
  };

  return (
    <main className="min-h-screen bg-white text-black font-sans flex flex-col antialiased relative">
      {/* Background architectural design overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] bg-[size:4rem_4rem]"></div>

      {/* Header Section (Bold Typography Theme style) */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end p-8 md:p-10 border-b border-black gap-6 z-10 bg-white">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none uppercase font-display">
            WhaleWhisper
          </h1>
          <p className="text-[10px] md:text-xs tracking-[0.2em] font-bold text-zinc-500 uppercase font-mono">
            On-Chain Intelligence Agent / X-Layer Protocol
          </p>
        </div>

        <div className="flex flex-wrap gap-6 md:gap-10 text-left md:text-right font-mono">
          <div className="space-y-1">
            <p className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold">Network</p>
            <p className="text-xs md:text-sm font-black">EIP155:196</p>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold">Cost</p>
            <p className="text-xs md:text-sm font-black text-emerald-600">$0.01 USDC</p>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold">Status</p>
            <div className="flex items-center gap-1.5 md:justify-end">
              <span className={`w-2 h-2 rounded-full ${walletType !== "none" ? "bg-emerald-500" : "bg-red-500"}`} />
              <p className="text-xs md:text-sm font-black uppercase">
                {walletType !== "none" ? "CONNECTED" : "OFFLINE"}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid Content Area */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 z-10">
        
        {/* Sidebar Info (col-span-4) */}
        <section className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-black p-8 md:p-10 flex flex-col justify-between bg-white gap-10">
          <div className="space-y-10">
            
            {/* System Pulse Section */}
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest mb-6 border-b border-black pb-2 font-mono">
                System Pulse
              </h2>
              <div className="space-y-4 font-mono">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-zinc-500">Whales Monitored</span>
                  <span className="text-xl font-black tabular-nums">2,042 wallets</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-zinc-500">24h Net Inflow</span>
                  <span className="text-xl font-black tabular-nums text-emerald-600">+$42.8M</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-zinc-500">Market Index</span>
                  <span className="text-xl font-black uppercase">Accumulation</span>
                </div>
              </div>
            </div>

            {/* Strategy matrix */}
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest mb-4 border-b border-black pb-2 font-mono">
                Risk Strategy Matrix
              </h2>
              
              <div className="grid grid-cols-3 gap-2 mb-4">
                {(["DEFENSIVE", "BALANCED", "DEGEN"] as const).map((profile) => (
                  <button
                    key={profile}
                    onClick={() => {
                      setRiskProfile(profile);
                      addLog(`Strategy target rotated to [${profile}]`, "info");
                    }}
                    className={`py-2 text-[10px] font-mono font-black border-2 transition-all flex flex-col items-center justify-center ${
                      riskProfile === profile
                        ? "bg-black border-black text-white"
                        : "bg-white border-black text-black hover:bg-zinc-100"
                    }`}
                  >
                    <span>{profile}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <p className="text-sm leading-snug font-medium text-neutral-800">
                  {riskProfile === "DEGEN" && "Whales are aggressively rotating out of L1 majors into high-beta memecoin indexes. Swiping POPCAT & WIF on X Layer."}
                  {riskProfile === "BALANCED" && "Whales are accumulating SOL/OKB in massive buy walls while distributing BTC. Medium-risk spot allocations optimized."}
                  {riskProfile === "DEFENSIVE" && "Yield protection phase active. Whales withdrawing USDC and USDT into yield aggregators to guard against distribution."}
                </p>
                <div className="text-xs text-zinc-400 font-mono">
                  Target Weightings: <span className="text-black font-semibold uppercase">{riskProfile} Profile</span>
                </div>

                {/* Allocation Ratio grid box matching the mockup */}
                <div className="grid grid-cols-3 gap-3 border border-black p-4 bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                  {getPortfolioAllocations().map((item) => (
                    <div key={item.token}>
                      <p className="text-[10px] uppercase font-black text-zinc-400 font-mono">{item.token}</p>
                      <p className="text-xl font-black">{item.ratio}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Timeframe Analysis Panel */}
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest mb-4 border-b border-black pb-2 font-mono">
                Analysis Timeframe
              </h2>
              
              <div className="grid grid-cols-4 gap-1.5 mb-4">
                {(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTimeframe(t);
                      addLog(`Analysis timeframe target rotated to [${t}]`, "info");
                    }}
                    className={`py-2 text-[9px] font-mono font-black border-2 transition-all flex flex-col items-center justify-center ${
                      timeframe === t
                        ? "bg-black border-black text-white"
                        : "bg-white border-black text-black hover:bg-zinc-100"
                    }`}
                  >
                    <span>{t}</span>
                  </button>
                ))}
              </div>

              {/* Action Button: Generate Portfolio Advice */}
              <button
                onClick={generateTimeframePortfolio}
                disabled={isGenerating}
                className="w-full py-3 bg-black text-white border-2 border-black text-xs font-black uppercase tracking-wider hover:bg-white hover:text-black transition-all flex items-center justify-center space-x-2 font-mono shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none"
              >
                <span>{isGenerating ? "Analyzing..." : `Analyze ${timeframe} Flows`}</span>
              </button>
            </div>

            {/* Wallet Connector Section */}
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest mb-4 border-b border-black pb-2 font-mono">
                Wallet Session
              </h2>
              {walletType !== "none" ? (
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-4 bg-zinc-50 border border-zinc-200 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Provider</span>
                      <span className="font-bold uppercase text-[10px] px-1 bg-neutral-200 rounded">
                        {walletType}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Address</span>
                      <span className="font-bold">{address.slice(0, 6)}...{address.slice(-4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Balance</span>
                      <span className="font-bold text-neutral-800">${balance} USDC</span>
                    </div>
                  </div>
                  <button
                    onClick={disconnectWallet}
                    className="w-full py-2 bg-white text-black border border-black text-xs font-black uppercase tracking-wider hover:bg-black hover:text-white transition-all font-mono"
                  >
                    Disconnect Wallet
                  </button>
                </div>
              ) : (
                <div className="space-y-2 font-mono">
                  <button
                    onClick={connectSandbox}
                    className="w-full py-2.5 bg-zinc-50 border border-black text-xs font-black uppercase tracking-wider hover:bg-zinc-100 transition-all flex items-center justify-center space-x-2"
                  >
                    <Cpu className="w-3.5 h-3.5 text-black" />
                    <span>Launch Sandbox Key</span>
                  </button>
                  <button
                    onClick={connectReal}
                    className="w-full py-2.5 bg-black text-white border border-black text-xs font-black uppercase tracking-wider hover:bg-white hover:text-black transition-all flex items-center justify-center space-x-2"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Connect OKX Wallet</span>
                  </button>
                  <p className="text-[10px] text-zinc-400 leading-relaxed text-center">
                    Requires a connected Web3 keypair to settle OKX x402 payment headers.
                  </p>
                </div>
              )}

              {/* Sandbox verification configuration bypass checkbox */}
              <div className="flex items-center space-x-2 pt-3 border-t border-dashed border-zinc-200 mt-3 font-mono text-[10px]">
                <input
                  type="checkbox"
                  id="forceSandbox"
                  checked={forceSandboxSign}
                  onChange={(e) => {
                    setForceSandboxSign(e.target.checked);
                    addLog(`Bypass signature prompt set to: ${e.target.checked}`, "info");
                  }}
                  className="rounded border-black accent-black cursor-pointer h-3.5 w-3.5"
                />
                <label htmlFor="forceSandbox" className="font-black text-zinc-700 cursor-pointer select-none">
                  FAST-TRACK PAYMENTS (AUTO-SIGN)
                </label>
              </div>
            </div>

          </div>

          {/* Identity panel block */}
          <div className="p-6 bg-zinc-50 border border-zinc-200">
            <p className="text-[10px] uppercase tracking-widest text-zinc-400 mb-2 font-mono font-bold">Agent Identity</p>
            <p className="text-xs leading-relaxed text-zinc-600 font-mono">
              ID: WW-GENESIS-01<br/>
              TYPE: ASP (Agentic Service Provider)<br/>
              PROTO: OKX x402
            </p>
          </div>
        </section>

        {/* Chat Terminal Section (col-span-8) */}
        <section className="lg:col-span-8 flex flex-col bg-zinc-50 min-h-[500px] border-t lg:border-t-0 lg:border-l border-black">
          
          {/* Tab Switcher at the top of Section */}
          <div className="flex border-b border-black font-mono text-xs bg-white">
            <button
              onClick={() => {
                setActiveTab("dashboard");
                addLog("Tab rotated: Whale Wizard Dashboard", "info");
              }}
              className={`flex-1 py-4 text-center font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-2 border-r border-black ${
                activeTab === "dashboard" ? "bg-black text-white" : "bg-white text-black hover:bg-zinc-100"
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Whale Wizard Dashboard</span>
            </button>
            <button
              onClick={() => {
                setActiveTab("chat");
                addLog("Tab rotated: Terminal Chat", "info");
              }}
              className={`flex-1 py-4 text-center font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-2 ${
                activeTab === "chat" ? "bg-black text-white" : "bg-white text-black hover:bg-zinc-100"
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Terminal Chat</span>
            </button>
          </div>

          {activeTab === "chat" ? (
            /* Messages view wrapper */
            <div className="flex-1 p-8 md:p-10 overflow-y-auto space-y-10 scrollbar-thin">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex gap-4 items-start"
                  >
                    {msg.sender === "user" ? (
                      <div className="flex gap-4 items-start w-full">
                        <div className="text-xl text-neutral-400 mt-1">→</div>
                        <div className="space-y-1 w-full">
                          <p className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-zinc-400">
                            CLIENT REQUEST // {msg.timestamp}
                          </p>
                          <p className="text-xl font-medium text-black border-b-2 border-black pb-2 inline-block max-w-full">
                            {msg.text}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-4 items-start w-full">
                        <div className="w-1.5 bg-black self-stretch min-h-[40px] flex-shrink-0"></div>
                        <div className="space-y-4 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-mono font-black uppercase tracking-[0.2em] text-black">
                              WhaleWhisper // {msg.timestamp}
                            </p>
                            {msg.paymentDetails && (
                              <span className="text-[9px] font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-black uppercase border border-emerald-300">
                                SETTLED
                              </span>
                            )}
                          </div>
                          <div className="space-y-4 max-w-3xl">
                            <div className="prose max-w-none text-zinc-950 font-mono text-xs leading-relaxed">
                              {renderMarkdown(msg.text)}
                            </div>
                            
                            {msg.paymentDetails && (
                              <div className="p-4 bg-white border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-w-md font-mono text-[10px] text-zinc-500 space-y-1">
                                <p className="font-bold uppercase text-black">OKX SETTLED TRANSACTION LOG</p>
                                <div className="flex justify-between">
                                  <span>Settled amount:</span>
                                  <span className="font-black text-black">{msg.paymentDetails.amount}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Network Layer:</span>
                                  <span className="text-black">{msg.paymentDetails.network}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Verification Scheme:</span>
                                  <span className="text-black">{msg.paymentDetails.scheme}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {isGenerating && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center space-x-3 text-xs font-mono text-zinc-500 pl-6 border-l-2 border-dashed border-black/20 py-2"
                >
                  <div className="flex space-x-1">
                    <span className="h-1.5 w-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="h-1.5 w-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="h-1.5 w-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                  <span className="font-bold tracking-tight uppercase">Settling x402 handshakes & compiling smart money analytics...</span>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            /* Wizard Dashboard view */
            <div className="flex-1 p-8 md:p-10 overflow-y-auto space-y-8 scrollbar-thin bg-white">
              
              {/* Step 1: Detect & List Whales */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-mono text-xs font-black">1</div>
                  <h3 className="text-sm font-black uppercase tracking-wider font-mono text-black">Whale Wallet Directory</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {whaleList.map((w) => {
                    const isTracked = trackedWallets.includes(w.address);
                    return (
                      <div key={w.address} className="border border-black p-4 bg-zinc-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-[10px] font-black uppercase font-mono px-2 py-0.5 bg-black text-white">{w.alias}</span>
                            <span className="font-mono text-[9px] text-zinc-500 whitespace-nowrap">{w.address.slice(0, 8)}...{w.address.slice(-6)}</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-zinc-600 font-mono">{w.details}</p>
                        </div>
                        <button
                          onClick={() => {
                            if (isTracked) {
                              setTrackedWallets(prev => prev.filter(addr => addr !== w.address));
                              addLog(`Stopped tracking whale: ${w.alias}`, "warning");
                            } else {
                              setTrackedWallets(prev => [...prev, w.address]);
                              addLog(`Started tracking whale: ${w.alias}`, "success");
                            }
                          }}
                          className={`mt-4 w-full py-1.5 border border-black text-[10px] font-black uppercase font-mono transition-all ${
                            isTracked ? "bg-zinc-800 text-white hover:bg-zinc-700" : "bg-white text-black hover:bg-zinc-100"
                          }`}
                        >
                          {isTracked ? "✓ Tracking (Click to Untrack)" : "Track Wallet"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Live Transaction Monitor */}
              <div className="space-y-4 border-t border-black pt-8">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-mono text-xs font-black">2</div>
                  <h3 className="text-sm font-black uppercase tracking-wider font-mono text-black">
                    On-Chain Transaction Monitor ({timeframe} View)
                  </h3>
                </div>
                
                <div className="border border-black p-4 bg-zinc-50 font-mono text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-black mb-3">
                    <span className="font-black text-black">Captured Transactions ({getWhaleTransactions().length})</span>
                    <span className="text-[10px] text-zinc-500">Filtered by tracked wallets</span>
                  </div>
                  
                  {getWhaleTransactions().length > 0 ? (
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
                      {getWhaleTransactions().map((tx, idx) => (
                        <div key={idx} className="p-3 bg-white border border-zinc-200 text-[10px] leading-relaxed flex flex-col md:flex-row md:justify-between md:items-center gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-black">{tx.alias}</span>
                              <span className="text-zinc-400">→</span>
                              <span className={`font-black px-1 ${
                                tx.action === "BUY" || tx.action === "DEPOSIT" ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"
                              }`}>{tx.action}</span>
                              <span className="font-bold text-neutral-800">{tx.amount}</span>
                            </div>
                            <div className="text-zinc-500 text-[9px]">
                              Wallet: {tx.wallet.slice(0, 12)}... | Value: {tx.usdValue}
                            </div>
                          </div>
                          <span className="text-[9px] text-zinc-400 self-end md:self-center">{tx.timestamp}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-zinc-400 italic text-center py-6 text-[11px]">No tracked wallets selected. Toggle tracking on Step 1 to load transactions.</p>
                  )}
                </div>
              </div>

              {/* Step 3: Run AI Analysis */}
              <div className="space-y-4 border-t border-black pt-8">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-mono text-xs font-black">3</div>
                  <h3 className="text-sm font-black uppercase tracking-wider font-mono text-black">Whale Whisperer AI Engine</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-2">
                    <button
                      onClick={generateTimeframePortfolio}
                      disabled={isGenerating || getWhaleTransactions().length === 0}
                      className="flex-1 py-3 bg-black text-white border-2 border-black text-xs font-black uppercase tracking-wider hover:bg-white hover:text-black transition-all flex items-center justify-center space-x-2 font-mono shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none disabled:opacity-50 disabled:hover:bg-black disabled:hover:text-white"
                    >
                      <span>{isGenerating ? "Compiling Analysis..." : "Compile AI Portfolio Analysis ($0.01)"}</span>
                    </button>
                  </div>

                  {messages.some(m => m.sender === "agent" && m.id !== "welcome") ? (
                    <div className="border border-black p-6 bg-zinc-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4 max-h-[400px] overflow-y-auto scrollbar-thin">
                      <div className="flex justify-between items-center border-b border-black pb-2 mb-3">
                        <span className="font-mono text-xs font-black uppercase tracking-wider text-black">Latest AI Report</span>
                        <span className="font-mono text-[9px] text-zinc-500">Verified by OKX payment protocol</span>
                      </div>
                      <div className="prose max-w-none text-zinc-950 font-mono text-xs leading-relaxed">
                        {renderMarkdown(
                          [...messages]
                            .reverse()
                            .find(m => m.sender === "agent" && m.id !== "welcome")?.text || ""
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed border-black/30 p-8 text-center bg-zinc-50">
                      <p className="text-xs font-mono text-zinc-400 italic">No report compiled yet. Click the analyze button to process payment and request smart money insights.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 4 & 5: Portfolio Configurator & Smart Contract Deployment */}
              <div className="space-y-4 border-t border-black pt-8 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-mono text-xs font-black">4</div>
                  <h3 className="text-sm font-black uppercase tracking-wider font-mono text-black">Portfolio Allocations & Smart Contract Action</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      type: "DEGEN",
                      alloc: "45% SOL, 30% POPCAT, 15% WIF, 10% USDC",
                      pros: "Maximum leverage, chases whale meme rotations.",
                      cons: "High drawdowns, absolute risk exposure."
                    },
                    {
                      type: "BALANCED",
                      alloc: "40% BTC, 30% SOL, 20% ETH, 10% USDC",
                      pros: "Captures L1 growth while anchored in major stores of value.",
                      cons: "Underperforms during extreme meme market rallies."
                    },
                    {
                      type: "DEFENSIVE",
                      alloc: "50% USDC/USDT, 30% BTC, 15% ETH, 5% OKB",
                      pros: "Capital preservation, steady yield aggregation.",
                      cons: "Very low return in standard bullish expansions."
                    }
                  ].map((p) => (
                    <div
                      key={p.type}
                      onClick={() => setSelectedPortfolio(p.type as any)}
                      className={`border-2 p-4 cursor-pointer transition-all flex flex-col justify-between font-mono text-xs ${
                        selectedPortfolio === p.type
                          ? "bg-black border-black text-white shadow-none"
                          : "bg-white border-black text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-zinc-50"
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="font-black text-xs uppercase tracking-wider">{p.type} Target</span>
                          {selectedPortfolio === p.type && <span className="text-[10px] px-1 bg-white text-black font-bold">SELECTED</span>}
                        </div>
                        
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block">Allocation</span>
                          <p className="text-[11px] font-black">{p.alloc}</p>
                        </div>
                        
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase tracking-widest text-emerald-500 font-bold block">Pros</span>
                          <p className={`text-[10px] ${selectedPortfolio === p.type ? "text-zinc-300" : "text-zinc-600"}`}>{p.pros}</p>
                        </div>
                        
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase tracking-widest text-rose-500 font-bold block">Cons</span>
                          <p className={`text-[10px] ${selectedPortfolio === p.type ? "text-zinc-300" : "text-zinc-600"}`}>{p.cons}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedPortfolio && (
                  <div className="border border-black p-4 bg-zinc-50 font-mono text-xs space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div className="flex justify-between items-center border-b border-black pb-2">
                      <span className="font-black text-black">Active Configuration: {selectedPortfolio}</span>
                      <span className="text-[10px] text-zinc-400 font-bold">Target wallet: {address ? `${address.slice(0, 10)}...` : "Sandbox Key"}</span>
                    </div>

                    {activeAllocation === selectedPortfolio ? (
                      <div className="p-3 bg-emerald-50 border border-emerald-400 text-emerald-800 text-[10px] font-bold text-center uppercase tracking-wider">
                        ✓ Portfolio rule successfully set on connected wallet address!
                      </div>
                    ) : isDeploying ? (
                      <div className="space-y-2 p-3 bg-black text-white text-[10px] max-h-36 overflow-y-auto scrollbar-thin">
                        {deploymentLogs.map((l, i) => (
                          <div key={i} className="flex space-x-2">
                            <span className="text-zinc-500">[{i+1}]</span>
                            <span>{l}</span>
                          </div>
                        ))}
                        <div ref={deploymentLogsEndRef} />
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (walletType === "none") {
                            alert("Connect your wallet first to authorize the smart contract configuration.");
                            return;
                          }
                          setIsDeploying(true);
                          setDeploymentLogs([]);
                          addLog(`Initiating deployment ticket for ${selectedPortfolio} portfolio...`, "info");
                          
                          const steps = [
                            "Compiling EVM allocation contract schema on X Layer...",
                            "Authorizing bridge signatures & ERC-20 allowances...",
                            "Routing target spot balance weights (BTC/SOL/ETH)...",
                            "Broadcasting smart transaction payload to RPC...",
                            "Deployment Successful! Tx Hash: 0x" + "a".repeat(64) + " [Confirmed]"
                          ];

                          let currentStep = 0;
                          const interval = setInterval(() => {
                            if (currentStep < steps.length) {
                              setDeploymentLogs(prev => [...prev, steps[currentStep]]);
                              addLog(steps[currentStep], currentStep === steps.length - 1 ? "success" : "info");
                              currentStep++;
                            } else {
                              clearInterval(interval);
                              setIsDeploying(false);
                              setActiveAllocation(selectedPortfolio);
                              addLog(`Allocations for ${selectedPortfolio} successfully defined on connected wallet.`, "success");
                            }
                          }, 900);
                        }}
                        className="w-full py-3 bg-neutral-900 text-white font-black text-xs uppercase tracking-wider hover:bg-neutral-800 transition-all flex items-center justify-center space-x-2"
                      >
                        <span>Deploy Selected Ratio to Wallet</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Interactive Web3 handshake log console */}
          <div className="px-10 py-6 border-t border-black bg-white">
            <div className="flex justify-between items-center pb-2 mb-3 border-b border-zinc-200 text-neutral-500 font-mono font-bold uppercase text-[10px] tracking-widest">
              <div className="flex items-center space-x-1.5 text-black">
                <Terminal className="w-4 h-4" />
                <span>Web3 Handshake Ledger</span>
              </div>
              <button
                onClick={() => setLogs([])}
                className="hover:text-black text-zinc-400 transition-all flex items-center space-x-1"
                title="Clear logs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Ledger</span>
              </button>
            </div>
            <div className="h-28 overflow-y-auto space-y-1.5 scrollbar-thin font-mono text-[10px] leading-relaxed text-zinc-600">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start space-x-2">
                  <span className="text-zinc-400">[{log.timestamp}]</span>
                  <span
                    className={`${
                      log.type === "success"
                        ? "text-emerald-600 font-bold"
                        : log.type === "error"
                        ? "text-rose-600 font-bold"
                        : log.type === "warning"
                        ? "text-yellow-600 font-bold"
                        : "text-zinc-700"
                    }`}
                  >
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* Black Input & Payment Footer Row exactly like mockup styling */}
          <form onSubmit={sendMessage} className="h-auto md:h-24 bg-black text-white flex flex-col md:flex-row items-stretch md:items-center justify-between border-t border-black p-4 md:px-10 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold font-mono">
                  Secure Payment Channel Active
                </p>
                <p className="text-[9px] text-zinc-500 font-mono">
                  OKX Web3 Gateway Protection
                </p>
              </div>
            </div>

            <div className="flex-1 flex items-center gap-3 max-w-2xl">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask for allocation advice..."
                disabled={isGenerating}
                className="flex-1 bg-zinc-900 text-white placeholder-zinc-500 font-mono text-xs md:text-sm px-4 py-2.5 border-b-2 border-white focus:outline-none focus:border-zinc-300 transition-colors"
              />
              
              <div className="hidden lg:flex items-center gap-1 text-[10px] font-mono text-zinc-400 italic">
                <span>Requires $0.01 per query</span>
              </div>

              <button
                type="submit"
                disabled={isGenerating || !input.trim()}
                className="bg-white text-black px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:invert transition-colors disabled:opacity-50 disabled:hover:invert flex items-center gap-1"
              >
                <span>Prompt</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>

        </section>

      </main>

      {/* Bottom Metadata row matching design mockup */}
      <footer className="flex justify-between items-center px-10 py-6 border-t border-black bg-white z-10 font-mono">
        <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
          ©2026 WhaleWhisper Logic Systems
        </p>
        <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold hidden sm:block">
          Genesis Hackathon Entry [EIP-402 Compliant]
        </p>
      </footer>
    </main>
  );
}
