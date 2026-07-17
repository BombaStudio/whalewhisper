# 🐋 WhaleWhisper: On-Chain Whale Intelligence AI Agent

> **OKX.AI Genesis Hackathon Submission**
>
> *A native Web3 AI Agentic Service Provider (ASP) built using Next.js 15 (App Router), protected by the OKX x402 Web3 Payment Protocol.*

WhaleWhisper is a blunt, raw, and direct on-chain analyst. It monitors the movement of high-profile smart money wallets (Whales) using **real Ethereum Mainnet data via Alchemy**, analyzes transactions based on custom timeframes (Daily, Weekly, Monthly, Yearly), and outputs un-sugarcoated portfolio allocation advice tailored to three distinct risk appetites: **Degen**, **Balanced**, and **Defensive**.

Payment fees and on-chain actions are settled on **X Layer Testnet (Chain ID: 195)** using native OKB — ensuring zero real-money cost for testing/judging while all analytical intelligence draws from real Mainnet data.

---

## 🚀 Key Features

1. **Whale Wallet Directory (Step 1)**: Live-fetched from Alchemy Ethereum Mainnet. Track or untrack active high-profile wallets with real volume and transaction count data. Falls back to curated mock data if Alchemy is not configured.

2. **Live Transaction Monitor (Step 2)**: Pulls real large EVM transfers via Alchemy `alchemy_getAssetTransfers`. The Scanner → Sieve → Intent → Strategist multi-agent pipeline runs on real on-chain data.

3. **5-Category Wallet Classification**: The SieveAgent now classifies wallets into:
   - **Whale** — Large-volume, market-moving transactions (>$100K USD)
   - **Active Spender** — Frequent DeFi interactions, high buy/sell turnover
   - **Accumulator/Saver** — Steady buying, low sell activity
   - **Suspicious/Scammer** — Mixer-like patterns, rapid deposit-withdraw cycles
   - **Retail User** — Small sporadic transactions

4. **OKX x402 Protocol Protection (Step 3)**: Charges **$0.01 USDC** per analysis request on X Layer Testnet (eip155:195).

5. **Real Portfolio Context**: When a user connects their wallet, the server-side Alchemy client reads their **Ethereum Mainnet token balances** and injects a real portfolio breakdown into the StrategistAgent prompt for personalized recommendations.

6. **Portfolio Deployer (Steps 4 & 5)**: Charges **$0.02 USDC** deployment fee via x402. Executes proportional on-chain transactions (OKB native transfers + ERC-20 approve calls) on X Layer Testnet, with amounts derived from the AI-recommended portfolio deltas. Clearly labeled as **[TESTNET SIMULATION]**.

7. **FAST-TRACK PAYMENTS (Auto-Sign Mode)**: Toggle "Bypass Real Signer" to automatically sign payment handshakes using local sandbox keys.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router) + TypeScript + Bun |
| **AI Completions** | OpenRouter API (configurable model, default: `google/gemini-2.5-flash`) |
| **Web3 Libraries** | `viem`, `lucide-react`, `motion` |
| **Payment Protocol** | `@okxweb3/x402-fetch`, `@okxweb3/x402-evm`, `@okxweb3/x402-next` |
| **On-Chain Data** | Alchemy API (Ethereum Mainnet) — server-side only |
| **Price Oracle** | Alchemy Prices API → CoinGecko fallback |

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```env
# AI Agent Configuration (OpenRouter)
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=google/gemini-2.5-flash

# OKX x402 Payment Facilitator
OKX_API_KEY=your_okx_api_key_here
OKX_SECRET_KEY=your_okx_secret_key_here
OKX_PASSPHRASE=your_okx_passphrase_here
OKX_BASE_URL=https://api.okx.com

# Seller wallet — receives deployment fees on X Layer Testnet
SELLER_WALLET_ADDRESS=your_evm_wallet_address
NEXT_PUBLIC_SELLER_WALLET_ADDRESS=your_evm_wallet_address

# Alchemy API — SERVER-SIDE ONLY (no NEXT_PUBLIC_ prefix)
ALCHEMY_API_KEY=your_alchemy_api_key_here
ALCHEMY_NETWORK=eth-mainnet

# X Layer Testnet token contract addresses
NEXT_PUBLIC_TESTNET_USDC_ADDRESS=0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d
NEXT_PUBLIC_TESTNET_USDT_ADDRESS=0x67a15159048a1c8411c84b423f03b8420b9e29b4
NEXT_PUBLIC_TESTNET_BTC_ADDRESS=0x1111111111111111111111111111111111111111
NEXT_PUBLIC_TESTNET_ETH_ADDRESS=0x2222222222222222222222222222222222222222
NEXT_PUBLIC_TESTNET_SOL_ADDRESS=0x3333333333333333333333333333333333333333
NEXT_PUBLIC_TESTNET_POPCAT_ADDRESS=0x4444444444444444444444444444444444444444

# Application URL
APP_URL=http://localhost:3000
```

> ⚠️ **NEVER** use `NEXT_PUBLIC_ALCHEMY_API_KEY`. The Alchemy key must remain server-side only.

---

## 📦 Getting Started

### 1. Install Dependencies
```bash
bun install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Run Local Development Server
```bash
bun run dev
```
Open `http://localhost:3000` to interact with the ASP.

### 4. Build for Production
```bash
bun run build
```

---

## 🏗️ Architecture

```
User Browser                   Server (Next.js API Routes)
─────────────────────────────────────────────────────────
Connect Wallet (OKX/MetaMask)
        │
        ▼
[X Layer Testnet eip155:195]      [Ethereum Mainnet]
  OKB balance fetch               Alchemy: Large transfers
  USDC balance fetch              Alchemy: Token balances
        │                         CoinGecko: USD prices
        │                               │
        ▼                               ▼
  x402 Payment ($0.01)      /api/agent → Multi-Agent Pipeline:
        │                       ScannerAgent → live Alchemy data
        │                       SieveAgent   → 5-category classification
        │                       IntentAgent  → behavior decoding
        │                       StrategistAgent → portfolio optimization
        │                               │
        └──────────── Analysis Result ◄─┘
                        │
                        ▼
              Deploy Portfolio ($0.02)
              [X Layer Testnet Txns]
              Proportional OKB + ERC-20 approve
              Labeled: [TESTNET SIMULATION]
```

---

## 🔒 EIP-402 Payment Execution

- **Payment Challenge**: When requesting AI report, client receives HTTP 402 challenge.
- **Payment Signature**: Client generates EIP-712 typed data signature (OKX Wallet or Sandbox key).
- **Settlement**: USDC on X Layer Testnet (eip155:195).
- **Mock Fallback**: If OKX facilitator is unreachable, an offline verification mock activates to allow judging without real network dependency.
