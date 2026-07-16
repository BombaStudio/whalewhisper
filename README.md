# 🐋 WhaleWhisper: On-Chain Whale Intelligence AI Agent

> **OKX.AI Genesis Hackathon Submission**
> 
> *A native Web3 AI Agentic Service Provider (ASP) built using Next.js App Router, protected by the OKX x402 Web3 Payment Protocol.*

WhaleWhisper is a blunt, raw, and direct on-chain analyst. It monitors the movement of high-profile smart money wallets (Whales), analyzes transactions based on custom timeframes (Daily, Weekly, Monthly, Yearly), and outputs un-sugarcoated portfolio allocation advice tailored to three distinct risk appetites: **Degen**, **Balanced**, and **Defensive**.

The frontend features an ultra-minimalist **Swiss monochrome layout** with a detailed **Web3 Handshake Ledger** console that details the payment handshake events of the EIP-402 protocol.

---

## 🚀 Key Features

1.  **Whale Wallet Directory (Step 1)**: Track or untrack active high-profile wallets:
    *   `vitalik.eth` (Vitalik Buterin)
    *   `justinsun.eth` (Justin Sun)
    *   `hayes.eth` (Arthur Hayes)
    *   `gcr.eth` (GCR - Legendary Trader)
    *   `kang.eth` (Andrew Kang)
2.  **Live Transaction Monitor (Step 2)**: Sifts on-chain transactions dynamically based on the selected timeframe and which whales are actively tracked in Step 1.
3.  **OKX x402 Protocol Protection (Step 3)**: Charges **$0.01** per analysis request on the **X Layer eip155:196** network.
4.  **FAST-TRACK PAYMENTS (Auto-Sign Mode)**: Toggle sandbox validation to automatically sign payment permit handshakes using local keys, enabling immediate trial runs with zero gas fees or browser extension prompts.
5.  **Portfolio Configurator & Deployer (Step 4 & 5)**: Lock down spot ratio allocations on-chain with logs simulating smart contract deployment onto X Layer.
6.  **Terminal Chat**: Alternate classic chat view to ask customized questions directly to the WhaleWhisper agent.

---

## 🛠️ Tech Stack

*   **Framework**: Next.js 15 (App Router)
*   **Package Manager**: Bun
*   **AI completions**: OpenRouter API (`google/gemini-2.5-flash` or similar)
*   **Web3 Libraries**: `viem`, `lucide-react`, `motion`
*   **Payment Protocols**: `@okxweb3/x402-fetch`, `@okxweb3/x402-evm`

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```env
# AI Agent Configuration (OpenRouter)
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=google/gemini-2.5-flash

# OKX API Configuration (Mocked locally but required by server interfaces)
OKX_API_KEY=mock_key
OKX_SECRET_KEY=mock_secret
OKX_PASSPHRASE=mock_passphrase
OKX_BASE_URL=https://api.okx.com

# Frontend Application URL
APP_URL=http://localhost:3000
```

---

## 📦 Getting Started

### 1. Install Dependencies
Make sure you have [Bun](https://bun.sh) installed.
```bash
bun install
```

### 2. Run Local Development Server
```bash
bun run dev
```
Open `http://localhost:3000` to interact with the ASP.

### 3. Build for Production
Verify typescript checks and bundle size:
```bash
bun run build
```

---

## 🔒 EIP-402 payment execution

*   **Payment Challenge**: When requesting an AI report, the client receives an HTTP 402 challenge header requesting payment.
*   **Payment Signature**: The client generates a permit signature (using either a Sandbox local key or connected Web3 wallets like OKX Web3 Wallet).
*   **Mock Verification**: For the convenience of the Hackathon judges, verification and settlement endpoints are fully mocked inside `app/api/agent/route.ts` to allow sandbox payments to succeed immediately without spending real money.
