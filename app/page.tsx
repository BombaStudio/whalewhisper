"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Wallet,
  Coins,
  Shield,
  Activity,
  Cpu,
  ArrowRight,
  Terminal,
  RotateCcw,
  ArrowUpRight,
  Lock
} from "lucide-react";
import { createPublicClient, http, createWalletClient, custom } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { wrapFetchWithPaymentFromConfig } from "@okxweb3/x402-fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@okxweb3/x402-evm";
import { TOKEN_REGISTRY, MOCK_TOKEN_PRICES } from "@/lib/utils";

interface LogEntry {
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: string;
}

const publicClient = createPublicClient({
  chain: {
    id: 195,
    name: "X Layer Testnet",
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    rpcUrls: {
      default: { http: ["https://xlayertestrpc.okx.com"] },
    },
  },
  transport: http(),
});

export default function Home() {
  // Config & State
  const [riskProfile, setRiskProfile] = useState<"DEGEN" | "BALANCED" | "DEFENSIVE">("BALANCED");
  const [timeframe, setTimeframe] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY">("DAILY");

  // Wallet
  const [walletType, setWalletType] = useState<"none" | "sandbox" | "real">("none");
  const [address, setAddress] = useState<string>("");
  const [okbBalance, setOkbBalance] = useState<string>("0.0000");
  const [usdcBalance, setUsdcBalance] = useState<string>("0.00");
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [forceSandboxSign, setForceSandboxSign] = useState<boolean>(true);
  const [showFaucetModal, setShowFaucetModal] = useState<boolean>(false);

  // Agent Pipeline
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [agentStep, setAgentStep] = useState<number>(0); // 0: Idle, 1: Scan, 2: Sieve, 3: Intent, 4: Strategist, 5: Done
  const [terminalLogs, setTerminalLogs] = useState<LogEntry[]>([]);
  const [analysisResult, setAnalysisResult] = useState<{
    classification: string;
    intent: string;
    rawLog: string[];
    portfolioRecommendation: Record<string, number>;
    currentPortfolio?: Record<string, number>;
    dataSource?: "live" | "mock";
  } | null>(null);

  // Deployment
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deploymentLogs, setDeploymentLogs] = useState<(string | React.ReactNode)[]>([]);
  const [isDeployed, setIsDeployed] = useState<boolean>(false);

  // Whale Directory
  const [whaleDirectory, setWhaleDirectory] = useState<{
    address: string;
    alias: string;
    totalVolumeUsd: number;
    txCount: number;
    source: "live" | "mock";
  }[]>([]);
  const [trackedWallets, setTrackedWallets] = useState<Set<string>>(new Set());
  const [whaleDirectoryLoading, setWhaleDirectoryLoading] = useState<boolean>(false);

  // Compute portfolio delta adjustments for the universal router
  const portfolioDeltas = React.useMemo(() => {
    if (!analysisResult) return [];

    const valuations: Record<string, number> = {};
    let totalValuation = 0;
    
    TOKEN_REGISTRY.forEach(token => {
      const balStr = tokenBalances[token.symbol] || "0.00";
      const price = MOCK_TOKEN_PRICES[token.symbol] || 1.0;
      const value = parseFloat(balStr) * price;
      valuations[token.symbol] = value;
      totalValuation += value;
    });

    const baselineValuation = totalValuation > 0 ? totalValuation : 1000.0;

    return TOKEN_REGISTRY.map(token => {
      const currentVal = valuations[token.symbol] || 0;
      const currentPct = totalValuation > 0 ? (currentVal / totalValuation) * 100 : 0;
      const targetPct = analysisResult.portfolioRecommendation[token.symbol] || 0;
      const deltaPct = targetPct - currentPct;
      const deltaUSD = (deltaPct * baselineValuation) / 100;

      return {
        symbol: token.symbol,
        currentPct: parseFloat(currentPct.toFixed(2)),
        targetPct,
        deltaPct: parseFloat(deltaPct.toFixed(2)),
        deltaUSD: parseFloat(deltaUSD.toFixed(2)),
        currentBalance: tokenBalances[token.symbol] || "0.00"
      };
    });
  }, [analysisResult, tokenBalances]);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const deployEndRef = useRef<HTMLDivElement>(null);

  // Helper to add terminal logs
  const addTerminalLog = (message: string, type: "info" | "success" | "warning" | "error" = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [...prev, { message, type, timestamp }]);
  };

  // Fetch real on-chain OKB and registry ERC-20 balances for the target address on X Layer Testnet
  const fetchBalances = async (walletAddress: string): Promise<{ okb: string; usdc: string }> => {
    if (!walletAddress) return { okb: "0.0000", usdc: "0.00" };
    const balances: Record<string, string> = {};
    
    for (const token of TOKEN_REGISTRY) {
      try {
        if (token.native) {
          const okbBI = await publicClient.getBalance({
            address: walletAddress as `0x${string}`,
          });
          const okbVal = Number(okbBI) / 1e18;
          balances[token.symbol] = okbVal.toFixed(4);
        } else {
          let tokenAddress = token.address;
          if (!tokenAddress) {
            if (token.symbol === "BTC") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_BTC_ADDRESS || "0x1111111111111111111111111111111111111111";
            else if (token.symbol === "ETH") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_ETH_ADDRESS || "0x2222222222222222222222222222222222222222";
            else if (token.symbol === "SOL") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_SOL_ADDRESS || "0x3333333333333333333333333333333333333333";
            else if (token.symbol === "POPCAT") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_POPCAT_ADDRESS || "0x4444444444444444444444444444444444444444";
            else if (token.symbol === "USDC") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_USDC_ADDRESS || "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d";
            else if (token.symbol === "USDT") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_USDT_ADDRESS || "0x67a15159048a1c8411c84b423f03b8420b9e29b4";
          }
          const balBI = await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: [{
              name: 'balanceOf',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: 'account', type: 'address' }],
              outputs: [{ name: '', type: 'uint256' }],
            }],
            functionName: 'balanceOf',
            args: [walletAddress as `0x${string}`],
          }) as bigint;
          const tokenVal = Number(balBI) / 10 ** token.decimals;
          balances[token.symbol] = tokenVal.toFixed(token.decimals === 6 ? 2 : 4);
        }
      } catch (err) {
        console.warn(`Failed to read balance for ${token.symbol}:`, err);
        balances[token.symbol] = token.decimals === 6 ? "0.00" : "0.0000";
      }
    }
    
    setTokenBalances(balances);
    const okbStr = balances["OKB"] || "0.0000";
    const usdcStr = balances["USDC"] || "0.00";
    setOkbBalance(okbStr);
    setUsdcBalance(usdcStr);
    
    return { okb: okbStr, usdc: usdcStr };
  };

  // Balance polling effect
  useEffect(() => {
    let active = true;
    const updateBalance = async () => {
      let activeAddr = "";
      if (walletType === "real") {
        activeAddr = address;
      } else if (walletType === "sandbox" || forceSandboxSign) {
        const pk = localStorage.getItem("whisper_sandbox_pk");
        if (pk) {
          try {
            activeAddr = privateKeyToAccount(pk as `0x${string}`).address;
          } catch {}
        }
      }

      if (!activeAddr) {
        if (active) {
          setOkbBalance("0.0000");
          setUsdcBalance("0.00");
        }
        return;
      }

      if (active) {
        await fetchBalances(activeAddr);
      }
    };

    updateBalance();
    const interval = setInterval(updateBalance, 8000); // Poll every 8s

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [walletType, address, forceSandboxSign]);

  // Listen for MetaMask/OKX wallet account and chain changes dynamically
  useEffect(() => {
    if (typeof window === "undefined" || walletType !== "real") return;

    const eth = (window as any).ethereum;
    if (!eth) return;

    const handleAccounts = async (accounts: string[]) => {
      if (accounts && accounts.length > 0) {
        setAddress(accounts[0]);
        await fetchBalances(accounts[0]);
        addTerminalLog(`Active wallet account updated: ${accounts[0]}`, "info");
      } else {
        setWalletType("none");
        setAddress("");
        setOkbBalance("0.0000");
        setUsdcBalance("0.00");
        addTerminalLog("Wallet account disconnected from MetaMask.", "warning");
      }
    };

    const handleChain = async (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      addTerminalLog(`Active chain changed to ID: ${chainId}`, "info");
      if (chainId !== 195) {
        addTerminalLog("Target network mismatch. Switch target in wallet UI to X Layer Testnet.", "warning");
      }
      if (address) {
        await fetchBalances(address);
      }
    };

    eth.on("accountsChanged", handleAccounts);
    eth.on("chainChanged", handleChain);

    return () => {
      if (eth.removeListener) {
        eth.removeListener("accountsChanged", handleAccounts);
        eth.removeListener("chainChanged", handleChain);
      }
    };
  }, [walletType, address]);

  // Auto detect active injected wallet session on mount
  useEffect(() => {
    const autoDetect = async () => {
      if (typeof window === "undefined") return;
      const eth = (window as any).ethereum;
      if (eth) {
        try {
          const accounts = await eth.request({ method: "eth_accounts" });
          if (accounts && accounts.length > 0) {
            setAddress(accounts[0]);
            setWalletType("real");
            setForceSandboxSign(false);
            await fetchBalances(accounts[0]);
            addTerminalLog(`Injected wallet session restored: ${accounts[0]}`, "success");
          }
        } catch (err) {
          console.error("Auto detect failed:", err);
        }
      }
    };
    autoDetect();
  }, []);

  // Connect Sandbox
  const connectSandbox = () => {
    setIsConnecting(true);
    addTerminalLog("Initializing local sandbox secure keypair...", "info");
    
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
        setForceSandboxSign(true);
        addTerminalLog(`Sandbox wallet loaded: ${account.address}`, "success");
      } catch (err: any) {
        addTerminalLog(`Failed to create sandbox wallet: ${err.message}`, "error");
      } finally {
        setIsConnecting(false);
      }
    }, 800);
  };

  // Connect Real Wallet
  const connectReal = async () => {
    if (typeof window === "undefined") return;
    setIsConnecting(true);
    addTerminalLog("Detecting injected Web3 wallet...", "info");

    const eth = (window as any).ethereum;
    if (!eth) {
      addTerminalLog("No injected Web3 Wallet detected. Please install OKX Web3 Wallet.", "error");
      setIsConnecting(false);
      return;
    }

    try {
      addTerminalLog("Requesting wallet connection...", "info");
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) {
        setAddress(accounts[0]);
        setWalletType("real");
        setForceSandboxSign(false);
        await fetchBalances(accounts[0]);
        addTerminalLog(`Connected browser wallet: ${accounts[0]}`, "success");
      } else {
        addTerminalLog("Wallet connection rejected by user.", "warning");
      }
    } catch (err: any) {
      addTerminalLog(`Wallet connection error: ${err.message}`, "error");
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setWalletType("none");
    setAddress("");
    setOkbBalance("0.0000");
    setUsdcBalance("0.00");
    addTerminalLog("Wallet session disconnected.", "warning");
  };

  // Trigger x402 payment and sequential agent pipeline
  const runAnalysis = async () => {
    if (isGenerating) return;

    const eth = (window as any).ethereum;
    let currentAddress = address;
    let currentWalletType = walletType;

    // Auto connect sandbox if forceSandboxSign is set and no wallet connected
    if (currentWalletType === "none") {
      if (forceSandboxSign) {
        let privKey = localStorage.getItem("whisper_sandbox_pk");
        if (!privKey) {
          privKey = generatePrivateKey();
          localStorage.setItem("whisper_sandbox_pk", privKey);
        }
        const account = privateKeyToAccount(privKey as `0x${string}`);
        currentAddress = account.address;
        setAddress(account.address);
        currentWalletType = "sandbox";
        setWalletType("sandbox");
        await fetchBalances(account.address);
        addTerminalLog(`Sandbox wallet auto-instantiated: ${account.address}`, "success");
      } else if (eth) {
        addTerminalLog("No active wallet session. Attempting auto-connection via injected Web3 provider...", "info");
        try {
          const accounts = await eth.request({ method: "eth_requestAccounts" });
          if (accounts && accounts.length > 0) {
            currentAddress = accounts[0];
            setAddress(currentAddress);
            currentWalletType = "real";
            setWalletType("real");
            await fetchBalances(accounts[0]);
            addTerminalLog(`Connected browser wallet: ${accounts[0]}`, "success");
          } else {
            addTerminalLog("Wallet connection rejected by user.", "error");
            alert("Please connect a wallet first.");
            return;
          }
        } catch (err: any) {
          addTerminalLog(`Wallet connection error: ${err.message}`, "error");
          alert("Wallet connection is required to authorize the payment handshake.");
          return;
        }
      } else {
        addTerminalLog("Authentication failed: No injected Web3 provider detected.", "error");
        alert("Please install OKX Web3 Wallet or MetaMask, or select Sandbox mode.");
        return;
      }
    }

    // Verify balance
    let activeAddr = currentAddress;
    if (currentWalletType === "sandbox") {
      const pk = localStorage.getItem("whisper_sandbox_pk");
      if (pk) {
        try {
          activeAddr = privateKeyToAccount(pk as `0x${string}`).address;
        } catch {}
      }
    }

    let fresh = { okb: okbBalance, usdc: usdcBalance };
    if (activeAddr) {
      fresh = await fetchBalances(activeAddr);
    }

    const okbVal = parseFloat(fresh.okb);
    const usdcVal = parseFloat(fresh.usdc);

    if (okbVal === 0) {
      setShowFaucetModal(true);
      addTerminalLog("Analysis aborted: Your testnet wallet is empty. Claims required from the faucet.", "error");
      return;
    }

    if (usdcVal < 0.01) {
      setShowFaucetModal(true);
      addTerminalLog(`Analysis aborted: insufficient Testnet USDC balance (${fresh.usdc} USDC). $0.01 USDC is required to proceed.`, "error");
      return;
    }

    // Reset pipeline state
    setIsGenerating(true);
    setAgentStep(1);
    setAnalysisResult(null);
    setIsDeployed(false);
    setDeploymentLogs([]);
    setTerminalLogs([]);

    addTerminalLog("Initializing OKX x402 payment handshake on eip155:195 (X Layer Testnet)...", "info");

    try {
      let signer;
      if (currentWalletType === "sandbox") {
        let pk = localStorage.getItem("whisper_sandbox_pk");
        if (!pk) {
          pk = generatePrivateKey();
          localStorage.setItem("whisper_sandbox_pk", pk);
        }
        const account = privateKeyToAccount(pk as `0x${string}`);
        signer = toClientEvmSigner({
          address: account.address,
          signTypedData: async (msg) => {
            return await account.signTypedData(msg as any);
          }
        });
      } else {
        // Connected via window.ethereum
        const walletClient = createWalletClient({
          account: currentAddress as `0x${string}`,
          chain: {
            id: 195,
            name: "X Layer Testnet",
            nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
            rpcUrls: {
              default: { http: ["https://xlayertestrpc.okx.com"] },
            },
          },
          transport: custom(eth)
        });

        // Switch to X Layer Testnet
        const currentChainId = await walletClient.getChainId();
        if (currentChainId !== 195) {
          try {
            addTerminalLog("Switching chain to X Layer Testnet...", "info");
            await walletClient.switchChain({ id: 195 });
          } catch (err: any) {
            if (err.code === 4902) {
              await eth.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: "0xc3",
                    chainName: "X Layer Testnet",
                    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
                    rpcUrls: ["https://xlayertestrpc.okx.com"],
                    blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer-test"],
                  },
                ],
              });
            } else {
              throw err;
            }
          }
        }

        signer = toClientEvmSigner({
          address: currentAddress as `0x${string}`,
          signTypedData: async (msg) => {
            return await walletClient.signTypedData({
              account: currentAddress as `0x${string}`,
              ...msg,
            } as any);
          }
        });
      }

      if (!signer) {
        throw new Error("Unable to construct EVM cryptographic signer.");
      }

      const fetchWithPay = wrapFetchWithPaymentFromConfig(window.fetch.bind(window), {
        schemes: [
          {
            network: "eip155:195",
            client: new ExactEvmScheme(signer),
          }
        ]
      });

      addTerminalLog("Broadcasting EIP-402 challenge request...", "info");

      const response = await fetchWithPay("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Perform Multi-Agent sequential search for ${riskProfile} risk target`,
          riskProfile,
          timeframe,
          transactions: [], // ScannerAgent fetches live from /api/whales internally
          userAddress: activeAddr || undefined, // Server-side Mainnet portfolio fetching
          trackedWallets: trackedWallets.size > 0 ? Array.from(trackedWallets) : undefined,
        })
      });

      if (response.status === 200) {
        addTerminalLog("x402 payment settled! Verification token accepted.", "success");
        if (currentWalletType === "sandbox") {
          setUsdcBalance(prev => (parseFloat(prev) - 0.01).toFixed(2));
        }

        const data = await response.json();
        const parsedResult = JSON.parse(data.analysis);
        // Attach currentPortfolio from server response
        if (data.currentPortfolio) {
          parsedResult.currentPortfolio = data.currentPortfolio;
        }
        
        // Execute visual sequential stream of agents
        streamAgentPipeline(parsedResult);
      } else {
        const errText = await response.text();
        addTerminalLog(`Resource Server returned error: ${errText}`, "error");
        setIsGenerating(false);
        setAgentStep(0);
      }

    } catch (err: any) {
      addTerminalLog(`Pipeline execution failure: ${err.message}`, "error");
      setIsGenerating(false);
      setAgentStep(0);
    }
  };

  // Sequential log streaming simulation
  const streamAgentPipeline = (result: any) => {
    // Phase 1: ScannerAgent
    setAgentStep(1);
    addTerminalLog("[1] ScannerAgent: Persona - Analytical on-chain data retrieval specialist.", "info");
    addTerminalLog("[1] ScannerAgent: Scanning EVM mainnet whale patterns...", "info");
    if (result.dataSource === "live") {
      addTerminalLog("[1] ScannerAgent: ✅ Live Alchemy data loaded successfully.", "success");
    } else {
      addTerminalLog("[1] ScannerAgent: ⚠ Mock data fallback active (Alchemy not configured or unreachable).", "warning");
    }
    
    setTimeout(() => {
      addTerminalLog("[1] ScannerAgent: Parsing sender, receiver, values, and token contracts...", "info");
      result.rawLog.forEach((log: string) => {
        addTerminalLog(`[1] ScannerAgent: Found ${log}`, "success");
      });

      // Phase 2: SieveAgent
      setTimeout(() => {
        setAgentStep(2);
        addTerminalLog("[2] SieveAgent: Persona - Hardened forensic blockchain investigator.", "info");
        addTerminalLog("[2] SieveAgent: Evaluating parsed wallet volumes and rotation activity...", "info");
        
        setTimeout(() => {
          addTerminalLog(`[2] SieveAgent: Wallet classification outcome -> ${result.classification}`, "success");

          // Phase 3: IntentAgent
          setTimeout(() => {
            setAgentStep(3);
            addTerminalLog("[3] IntentAgent: Persona - Behavioral market psychologist.", "info");
            addTerminalLog("[3] IntentAgent: Deciphering transfer intention and profit-taking bounds...", "info");
            
            setTimeout(() => {
              addTerminalLog(`[3] IntentAgent: Detected target behavior intent -> ${result.intent}`, "success");

              // Phase 4: StrategistAgent
              setTimeout(() => {
                setAgentStep(4);
                addTerminalLog("[4] StrategistAgent: Persona - Quantitative crypto portfolio strategist.", "info");
                addTerminalLog(`[4] StrategistAgent: Consolidating findings for risk appetite: ${riskProfile}...`, "info");
                
                setTimeout(() => {
                  addTerminalLog("[4] StrategistAgent: Formulating optimized portfolio ratios...", "success");
                  addTerminalLog("[4] StrategistAgent: Pipeline execution complete. Final values unlocked.", "success");
                  
                  // Final Reveal
                  setAnalysisResult(result);
                  setAgentStep(5);
                  setIsGenerating(false);
                }, 1000);
              }, 1000);
            }, 1000);
          }, 1000);
        }, 1000);
      }, 1200);
    }, 1500);
  };

  // Execute real on-chain portfolio deployment simulation via native OKB transfer
  const deployPortfolio = async () => {
    if (isDeploying || isDeployed || !analysisResult) return;
    setIsDeploying(true);
    setDeploymentLogs([]);

    const addLog = (log: string | React.ReactNode) => {
      setDeploymentLogs(prev => [...prev, log]);
    };

    const sellerAddress = (process.env.NEXT_PUBLIC_SELLER_WALLET_ADDRESS || process.env.SELLER_WALLET_ADDRESS || "0x742d35Cc6634C0532925a3b844Bc454e4438f44e") as `0x${string}`;

    try {
      if (parseFloat(okbBalance) <= 0) {
        throw new Error("Your connected wallet is empty. Please visit the Faucet at https://www.okx.com/en-sg/help/okx-ai-101 to claim free Testnet OKB.");
      }

      addLog("[Router] Initializing OKX x402 payment handshake for deployment authorization...");
      await new Promise(r => setTimeout(r, 600));

      let signer;
      if (walletType === "sandbox") {
        const pk = localStorage.getItem("whisper_sandbox_pk");
        if (!pk) throw new Error("No sandbox private key found.");
        const account = privateKeyToAccount(pk as `0x${string}`);
        signer = toClientEvmSigner({
          address: account.address,
          signTypedData: async (msg) => {
            return await account.signTypedData(msg as any);
          }
        });
      } else {
        const eth = (window as any).ethereum;
        if (!eth) throw new Error("No injected Web3 provider detected.");
        const walletClientForSign = createWalletClient({
          account: address as `0x${string}`,
          chain: {
            id: 195,
            name: "X Layer Testnet",
            nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
            rpcUrls: {
              default: { http: ["https://xlayertestrpc.okx.com"] },
            },
          },
          transport: custom(eth)
        });

        signer = toClientEvmSigner({
          address: address as `0x${string}`,
          signTypedData: async (msg) => {
            return await walletClientForSign.signTypedData({
              account: address as `0x${string}`,
              ...msg,
            } as any);
          }
        });
      }

      if (!signer) {
        throw new Error("Unable to construct EVM cryptographic signer for deployment payment.");
      }

      const fetchWithPay = wrapFetchWithPaymentFromConfig(window.fetch.bind(window), {
        schemes: [
          {
            network: "eip155:195",
            client: new ExactEvmScheme(signer),
          }
        ]
      });

      addLog("[Router] Charging $0.02 USDC deployment verification fee...");
      const payResponse = await fetchWithPay("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Portfolio deployment authorization" })
      });

      if (payResponse.status !== 200) {
        const errText = await payResponse.text();
        throw new Error(`Deployment payment verification failed: ${errText}`);
      }

      addLog("[Router] x402 payment settled! Deployment authorization confirmed.");
      if (walletType === "sandbox") {
        setUsdcBalance(prev => (parseFloat(prev) - 0.02).toFixed(2));
      }
      await new Promise(r => setTimeout(r, 600));

      addLog("[Router] Initiating portfolio rebalancing sequence...");
      await new Promise(r => setTimeout(r, 600));

      addLog(`[Router] Realignment target: ${Object.entries(analysisResult.portfolioRecommendation)
        .map(([asset, percentage]) => `${asset} (${percentage}%)`)
        .join(", ")}`);
      await new Promise(r => setTimeout(r, 600));

      let walletClient;
      if (walletType === "sandbox") {
        const pk = localStorage.getItem("whisper_sandbox_pk");
        if (!pk) throw new Error("No sandbox private key found.");
        const account = privateKeyToAccount(pk as `0x${string}`);
        walletClient = createWalletClient({
          account,
          chain: {
            id: 195,
            name: "X Layer Testnet",
            nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
            rpcUrls: {
              default: { http: ["https://xlayertestrpc.okx.com"] },
            },
          },
          transport: http()
        });
      } else {
        const eth = (window as any).ethereum;
        if (!eth) throw new Error("No injected Web3 provider detected.");
        walletClient = createWalletClient({
          account: address as `0x${string}`,
          chain: {
            id: 195,
            name: "X Layer Testnet",
            nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
            rpcUrls: {
              default: { http: ["https://xlayertestrpc.okx.com"] },
            },
          },
          transport: custom(eth)
        });
      }

      // Loop through all whitelisted assets in registry that have target recommendations > 0
      const activeTargets = portfolioDeltas.filter(item => item.targetPct > 0);

      if (activeTargets.length === 0) {
        addLog("[Router] No allocation shifts required. Realignment complete.");
        setIsDeployed(true);
        return;
      }

      for (const item of activeTargets) {
        const token = TOKEN_REGISTRY.find(t => t.symbol === item.symbol);
        if (!token) continue;

        // ── Proportional amount calculation (TESTNET SIMULATION) ────────────
        // We derive amounts from deltaUSD but cap at safe testnet limits.
        // These are NOT real DEX swaps — this is a simulated rebalancing signal
        // on X Layer Testnet. No real assets change hands.
        const MOCK_USD_PRICES: Record<string, number> = {
          OKB: 45, BTC: 62000, ETH: 3300, SOL: 150,
          POPCAT: 0.65, USDC: 1.0, USDT: 1.0,
        };
        const tokenUsdPrice = MOCK_USD_PRICES[token.symbol] || 1.0;
        const absUsd = Math.abs(item.deltaUSD) || 0.5; // min 0.5 USD
        
        addLog(
          <span className="text-zinc-400 text-xs">
            [TESTNET SIMULATION] {token.symbol}: Δ{item.deltaPct > 0 ? "+" : ""}{item.deltaPct.toFixed(1)}% ≈ ${absUsd.toFixed(2)} USD rebalancing signal
          </span>
        );
        addLog(`[Router] Processing swap to Testnet ${token.symbol}...`);
        await new Promise(r => setTimeout(r, 600));

        let hash: `0x${string}`;
        if (token.native) {
          // OKB Native: proportional amount, capped at 0.001 OKB
          const rawAmount = absUsd / tokenUsdPrice;
          const cappedOkb = Math.min(rawAmount, 0.001); // max 0.001 OKB on testnet
          const weiAmount = BigInt(Math.floor(cappedOkb * 1e18));
          const safeWei = weiAmount < BigInt(1) ? BigInt("1000000000000") : weiAmount; // min 0.000001 OKB
          hash = await walletClient.sendTransaction({
            to: sellerAddress,
            value: safeWei,
            gas: BigInt("21000")
          });
        } else {
          // ERC-20: proportional approve amount, capped at reasonable units
          let tokenAddress = token.address;
          if (!tokenAddress) {
            if (token.symbol === "BTC") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_BTC_ADDRESS || "0x1111111111111111111111111111111111111111";
            else if (token.symbol === "ETH") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_ETH_ADDRESS || "0x2222222222222222222222222222222222222222";
            else if (token.symbol === "SOL") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_SOL_ADDRESS || "0x3333333333333333333333333333333333333333";
            else if (token.symbol === "POPCAT") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_POPCAT_ADDRESS || "0x4444444444444444444444444444444444444444";
            else if (token.symbol === "USDC") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_USDC_ADDRESS || "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d";
            else if (token.symbol === "USDT") tokenAddress = process.env.NEXT_PUBLIC_TESTNET_USDT_ADDRESS || "0x67a15159048a1c8411c84b423f03b8420b9e29b4";
          }
          
          // Proportional token units: absUsd / price, with 6-decimal cap for stables
          const decimals = (token.symbol === "USDC" || token.symbol === "USDT") ? 6 : 18;
          const rawTokenAmount = absUsd / tokenUsdPrice;
          const cappedAmount = Math.min(rawTokenAmount, decimals === 6 ? 100 : 0.001); // max 100 USDC or 0.001 crypto
          const approveAmount = BigInt(Math.floor(cappedAmount * 10 ** decimals));
          const safeApprove = approveAmount < BigInt(1) ? BigInt("1") : approveAmount;

          // Function selector for approve(address,uint256) = 0x095ea7b3
          const cleanSpender = sellerAddress.toLowerCase().replace("0x", "").padStart(64, "0");
          const cleanAmount = safeApprove.toString(16).padStart(64, "0");
          const calldata = `0x095ea7b3${cleanSpender}${cleanAmount}` as `0x${string}`;

          hash = await walletClient.sendTransaction({
            to: tokenAddress as `0x${string}`,
            data: calldata,
            gas: BigInt("65000")
          });
        }

        addLog(
          <span className="text-emerald-400">
            [Router] Processing swap to Testnet {token.symbol} (Tx:{" "}
            <a
              href={`https://www.okx.com/web3/explorer/xlayer-test/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
              className="underline font-bold text-white hover:text-zinc-200"
            >
              {hash.slice(0, 10)}...{hash.slice(-8)}
            </a>
            )... Success!
          </span>
        );
        await new Promise(r => setTimeout(r, 800));
      }

      addLog("[Router] All swap orders settled. Rebalancing sequence completed successfully!");
      setIsDeployed(true);
      
      // Update fresh balances
      if (address) {
        await fetchBalances(address);
      }
    } catch (err: any) {
      addLog(<span className="text-rose-500 font-bold">Deployment aborted: {err.message || err}</span>);
    } finally {
      setIsDeploying(false);
    }
  };

  // Fetch Whale Directory on mount
  useEffect(() => {
    setWhaleDirectoryLoading(true);
    fetch("/api/whales?sinceHours=24")
      .then((r) => r.json())
      .then((data: { whales?: any[] }) => {
        if (data?.whales && data.whales.length > 0) {
          setWhaleDirectory(data.whales.slice(0, 10));
          // Pre-select all wallets by default
          setTrackedWallets(new Set(data.whales.slice(0, 10).map((w: any) => w.address)));
        }
      })
      .catch((err) => console.warn("Whale Directory fetch failed:", err))
      .finally(() => setWhaleDirectoryLoading(false));
  }, []);

  // Scroll to bottom of log containers
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  useEffect(() => {
    deployEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [deploymentLogs]);

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white flex flex-col">
      {/* Swiss Header */}
      <header className="border-b border-black py-6 px-8 md:px-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white">
        <div>
          <h1 className="text-lg font-black tracking-tighter font-mono">WHALE WHISPER // PROTOCOL</h1>
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mt-0.5">Multi-Agent On-Chain Intelligence Pipeline</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="bypassSign"
              checked={forceSandboxSign}
              onChange={(e) => setForceSandboxSign(e.target.checked)}
              className="w-3.5 h-3.5 accent-black cursor-pointer"
            />
            <label htmlFor="bypassSign" className="text-xs font-mono select-none cursor-pointer uppercase text-zinc-600">
              Bypass Real Signer
            </label>
          </div>

          {walletType === "none" ? (
            <div className="flex gap-2">
              <button
                onClick={connectSandbox}
                className="px-3.5 py-1.5 border border-black hover:bg-black hover:text-white transition duration-200 text-xs font-mono font-bold uppercase"
              >
                Sandbox
              </button>
              <button
                onClick={connectReal}
                className="px-3.5 py-1.5 bg-black text-white hover:bg-zinc-800 transition duration-200 text-xs font-mono font-bold uppercase"
              >
                Connect Wallet
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-xs font-mono">
              <div className="border border-black px-3 py-1.5 bg-zinc-50">
                <span className="text-zinc-400">ADDR:</span> <span className="font-bold">{address.slice(0, 6)}...{address.slice(-4)}</span>
              </div>
              <div className="border border-black px-3 py-1.5 bg-zinc-50 flex gap-4">
                <div>
                  <span className="text-zinc-400 font-mono">OKB:</span> <span className="font-bold font-mono">{okbBalance}</span>
                </div>
                <div className="border-l border-zinc-300 pl-4">
                  <span className="text-zinc-400 font-mono">USDC:</span> <span className="font-bold font-mono">{usdcBalance}</span>
                </div>
              </div>
              <button
                onClick={disconnectWallet}
                className="px-3 py-1.5 border border-black hover:bg-black hover:text-white transition duration-200 font-bold uppercase"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Splitscreen Layout */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 border-b border-black">
        {/* Left Column: Monospace Terminal Agent Log */}
        <section className="border-r border-black flex flex-col bg-zinc-50">
          <div className="border-b border-black py-3 px-6 bg-white flex justify-between items-center">
            <span className="text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5" />
              AGENT PIPELINE LOGSTREAM
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${isGenerating ? "bg-amber-500 animate-pulse" : "bg-zinc-300"}`}></span>
              <span className="text-[10px] font-mono text-zinc-500 uppercase">{isGenerating ? "Analyzing..." : "Idle"}</span>
            </div>
          </div>

          <div className="flex-1 p-6 font-mono text-xs overflow-y-auto max-h-[calc(100vh-210px)] flex flex-col gap-2">
            {terminalLogs.length === 0 && (
              <div className="text-zinc-400 italic py-4">
                Pipeline inactive. Select configuration parameters and trigger whale analysis to begin stream.
              </div>
            )}
            {terminalLogs.map((log, index) => (
              <div key={index} className="leading-relaxed border-b border-zinc-100 pb-1 last:border-0">
                <span className="text-zinc-400">[{log.timestamp}]</span>{" "}
                <span className={
                  log.type === "success" ? "text-emerald-700 font-bold" :
                  log.type === "warning" ? "text-amber-600" :
                  log.type === "error" ? "text-rose-600 font-bold" :
                  "text-zinc-800"
                }>
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>
        </section>

        {/* Right Column: Allocation & Actions */}
        <section className="flex flex-col bg-white p-8 md:p-12 justify-between">
          <div className="space-y-8">
            {/* Whale Directory */}
            <div>
              <span className="text-[10px] tracking-widest font-mono text-zinc-400 uppercase font-black">WHALE WALLET DIRECTORY</span>
              <div className="flex items-center justify-between mt-1 mb-3 border-b border-black pb-2">
                <h2 className="text-xl font-black font-mono tracking-tighter uppercase">TRACKED WALLETS</h2>
                {whaleDirectory.length > 0 && (
                  <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 border ${
                    whaleDirectory[0]?.source === "live"
                      ? "border-emerald-600 text-emerald-600 bg-emerald-50"
                      : "border-amber-500 text-amber-600 bg-amber-50"
                  }`}>
                    {whaleDirectory[0]?.source === "live" ? "● LIVE ALCHEMY" : "⚠ MOCK DATA"}
                  </span>
                )}
              </div>

              {whaleDirectoryLoading ? (
                <div className="text-[10px] font-mono text-zinc-400 animate-pulse">Loading whale directory...</div>
              ) : whaleDirectory.length === 0 ? (
                <div className="text-[10px] font-mono text-zinc-400 italic">No whale data available. Configure ALCHEMY_API_KEY for live data.</div>
              ) : (
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                  {whaleDirectory.map((whale) => (
                    <label key={whale.address} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={trackedWallets.has(whale.address)}
                        onChange={() => {
                          setTrackedWallets(prev => {
                            const next = new Set(prev);
                            if (next.has(whale.address)) next.delete(whale.address);
                            else next.add(whale.address);
                            return next;
                          });
                        }}
                        className="w-3 h-3 accent-black flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-[10px] font-bold truncate block group-hover:text-black text-zinc-700">
                          {whale.alias}
                        </span>
                        <span className="font-mono text-[9px] text-zinc-400">
                          {whale.address.slice(0, 8)}...{whale.address.slice(-6)} · {whale.txCount} txns
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Header Configuration */}

            <div>
              <span className="text-[10px] tracking-widest font-mono text-zinc-400 uppercase font-black">PIPELINE METADATA</span>
              <h2 className="text-xl font-black font-mono tracking-tighter uppercase mt-1 mb-6 border-b border-black pb-2">TARGET STRATEGY</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-mono text-zinc-400 uppercase block mb-1">Risk Profile</label>
                  <select
                    value={riskProfile}
                    onChange={(e) => setRiskProfile(e.target.value as any)}
                    disabled={isGenerating}
                    className="w-full bg-white border border-black px-3 py-2 font-mono text-xs uppercase focus:outline-none cursor-pointer"
                  >
                    <option value="BALANCED">Balanced Allocation</option>
                    <option value="DEGEN">Degen Aggressive</option>
                    <option value="DEFENSIVE">Defensive Conservative</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono text-zinc-400 uppercase block mb-1">Timeframe View</label>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value as any)}
                    disabled={isGenerating}
                    className="w-full bg-white border border-black px-3 py-2 font-mono text-xs uppercase focus:outline-none cursor-pointer"
                  >
                    <option value="DAILY">Daily Flow</option>
                    <option value="WEEKLY">Weekly Structural</option>
                    <option value="MONTHLY">Monthly Macro</option>
                    <option value="YEARLY">Yearly Cycle</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Allocation Results */}
            <div className="border border-black p-6 bg-zinc-50 min-h-[220px] flex flex-col justify-between">
              {agentStep === 0 && !analysisResult && (
                <div className="my-auto text-center py-6">
                  <Lock className="w-6 h-6 mx-auto mb-2 text-zinc-300" />
                  <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Analysis Result Locked</p>
                  <p className="text-[10px] font-mono text-zinc-400 mt-1">Please pay $0.01 testnet fee to execute sequential pipeline.</p>
                </div>
              )}

              {isGenerating && agentStep < 5 && (
                <div className="my-auto space-y-3 py-6">
                  <div className="h-1 bg-zinc-200 overflow-hidden border border-black relative">
                    <div 
                      className="absolute h-full bg-black transition-all duration-300" 
                      style={{ width: `${(agentStep / 4) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 uppercase">
                    <span>Orchestrating Agents...</span>
                    <span>Step {agentStep} of 4</span>
                  </div>
                </div>
              )}

              {analysisResult && agentStep === 5 && (
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between items-end border-b border-zinc-200 pb-1.5">
                      <span className="text-[10px] font-mono text-zinc-400 uppercase">Wallet Class</span>
                      <span className="text-xs font-mono font-bold uppercase">{analysisResult.classification}</span>
                    </div>
                    <div className="flex justify-between items-end border-b border-zinc-200 pb-1.5 mt-2">
                      <span className="text-[10px] font-mono text-zinc-400 uppercase">Intended Behavior</span>
                      <span className="text-xs font-mono font-bold uppercase">{analysisResult.intent}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 uppercase block mb-3">Portfolio Realignment & Deltas</span>
                    <div className="space-y-3">
                      {portfolioDeltas.map((item) => {
                        if (item.targetPct === 0 && item.currentPct === 0) return null;
                        const isPositive = item.deltaPct > 0;
                        const isZero = item.deltaPct === 0;

                        return (
                          <div key={item.symbol} className="border border-zinc-250 p-3 bg-white/70">
                            <div className="flex justify-between items-center text-[11px] font-mono mb-1">
                              <span className="font-bold">{item.symbol}</span>
                              <span className="text-zinc-500 font-bold">{item.currentBalance} {item.symbol}</span>
                            </div>
                            
                            <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500 mb-2">
                              <span>Allocation: {item.currentPct}% &rarr; {item.targetPct}%</span>
                              <span className={isZero ? "text-zinc-400 font-bold" : isPositive ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                                {isZero ? "0.00%" : `${isPositive ? "+" : ""}${item.deltaPct}% (${isPositive ? "+" : ""}$${item.deltaUSD.toFixed(2)})`}
                              </span>
                            </div>

                            <div className="w-full h-2 bg-zinc-200 border border-black relative">
                              <div
                                className="h-full bg-black transition-all duration-500"
                                style={{ width: `${item.targetPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 space-y-4">
            {/* Deploy Console for testnet simulation */}
            {deploymentLogs.length > 0 && (
              <div className="border border-black p-4 bg-zinc-950 text-emerald-500 font-mono text-[10px] rounded-none max-h-[140px] overflow-y-auto">
                {deploymentLogs.map((dLog, idx) => (
                  <div key={idx} className="mb-0.5">
                    <span className="text-emerald-700 font-bold">&gt;&gt;</span> {dLog}
                  </div>
                ))}
                <div ref={deployEndRef} />
              </div>
            )}

            {parseFloat(okbBalance) === 0 && walletType !== "none" && (
              <div className="text-rose-600 font-mono text-[10px] uppercase text-center border border-rose-600 bg-rose-50/50 py-2.5 px-4 mb-4">
                Your testnet wallet is empty. Please use the OKX Faucet or visit{" "}
                <a 
                  href="https://www.okx.com/en-sg/help/okx-ai-101" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="underline font-bold text-rose-800 hover:text-black"
                >
                  https://www.okx.com/en-sg/help/okx-ai-101
                </a>{" "}
                to claim free OKB.
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              {analysisResult && agentStep === 5 ? (
                <button
                  onClick={deployPortfolio}
                  disabled={isDeploying || isDeployed}
                  className={`w-full py-3.5 font-mono text-xs font-bold uppercase tracking-wider transition border border-black ${
                    isDeployed
                      ? "bg-zinc-100 text-zinc-400 cursor-not-allowed border-zinc-200"
                      : isDeploying
                      ? "bg-white text-black cursor-not-allowed"
                      : "bg-black text-white hover:bg-zinc-800"
                  }`}
                >
                  {isDeployed ? "ALLOCATION DEPLOYED" : isDeploying ? "DEPLOYING TO TESTNET..." : "DEPLOY PORTFOLIO ON TESTNET ($0.02 USDC)"}
                </button>
              ) : (
                <button
                  onClick={runAnalysis}
                  disabled={isGenerating}
                  className={`w-full py-3.5 font-mono text-xs font-bold uppercase tracking-wider transition border border-black ${
                    isGenerating
                      ? "bg-zinc-100 text-zinc-400 cursor-not-allowed border-zinc-200"
                      : "bg-black text-white hover:bg-zinc-800"
                  }`}
                >
                  {isGenerating ? "EXECUTING PIPELINE..." : "TRIGGER WHALE ANALYSIS ($0.01 TESTNET)"}
                </button>
              )}
            </div>
            
            {/* Need Testnet Funds onboarding group */}
            <div className="mt-4 text-center border-t border-zinc-150 pt-4">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Need Testnet Funds?</span>
              <div className="flex justify-center gap-4 mt-1.5">
                <a 
                  href="https://www.okx.com/xlayer/faucet" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-[10px] font-mono text-zinc-500 hover:text-black underline uppercase"
                >
                  X Layer Faucet
                </a>
                <a 
                  href="https://www.okx.com/en-sg/help/okx-ai-101" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-[10px] font-mono text-zinc-500 hover:text-black underline uppercase"
                >
                  OKX Help Faucet
                </a>
                <a 
                  href="https://www.okx.com/web3/build/faucet/xlayer" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-[10px] font-mono text-zinc-500 hover:text-black underline uppercase"
                >
                  Developer Faucet
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Swiss Footer */}
      <footer className="py-4 px-8 border-t border-black bg-white flex justify-between items-center text-[10px] font-mono text-zinc-400">
        <span>X Layer Chain ID: 195</span>
        <span>Status: Powered by Google Anti-Gravity SDK</span>
      </footer>

      {/* Faucet Overlay Modal */}
      {showFaucetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md w-full p-8 font-mono text-xs leading-relaxed relative">
            <h3 className="text-sm font-black border-b border-black pb-2 mb-4 uppercase tracking-tighter">INSUFFICIENT TESTNET GAS BALANCE</h3>
            <p className="text-zinc-600 mb-6 uppercase text-[10px]">
              You require at least 0.0001 OKB on X Layer Testnet to pay transaction fees and run the agent pipeline.
            </p>
            
            <div className="space-y-4">
              {walletType === "sandbox" && (
                <button
                  onClick={() => {
                    setOkbBalance("0.5000");
                    setUsdcBalance("10.00");
                    addTerminalLog("Auto-funded Sandbox wallet with mock OKB and Testnet USDC.", "success");
                    setShowFaucetModal(false);
                  }}
                  className="w-full py-2.5 border border-black hover:bg-zinc-50 font-bold uppercase tracking-wider"
                >
                  Auto-Fund Sandbox Key
                </button>
              )}
              <a
                href="https://www.okx.com/xlayer/faucet"
                target="_blank"
                rel="noreferrer"
                className="block text-center w-full py-2.5 bg-black text-white hover:bg-zinc-800 font-bold uppercase tracking-wider"
              >
                Open Official OKX Faucet
              </a>
              <button
                onClick={() => setShowFaucetModal(false)}
                className="w-full py-2 bg-zinc-100 hover:bg-zinc-200 font-bold text-zinc-500 uppercase tracking-wider mt-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
