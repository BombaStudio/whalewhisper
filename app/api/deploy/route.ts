import { NextRequest, NextResponse } from "next/server";
import { withX402, x402ResourceServer } from "@okxweb3/x402-next";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";

// Instantiate the OKX Facilitator Client using environment variables
const facilitatorClient = new OKXFacilitatorClient({
  apiKey: process.env.OKX_API_KEY || "",
  secretKey: process.env.OKX_SECRET_KEY || "",
  passphrase: process.env.OKX_PASSPHRASE || "",
  baseUrl: process.env.OKX_BASE_URL || "https://api.okx.com",
});

// Configure the X402 Resource Server
const server = new x402ResourceServer(facilitatorClient);

const exactEvmScheme = new ExactEvmScheme();

// Custom Money Parser for X Layer Testnet "eip155:195"
exactEvmScheme.registerMoneyParser(async (amount, network) => {
  if (network === "eip155:195") {
    // 0.02 USDC = 20,000 units (6 decimals)
    const tokenAmount = Math.round(amount * 1_000_000).toString();
    return {
      amount: tokenAmount,
      asset: process.env.NEXT_PUBLIC_TESTNET_USDC_ADDRESS || "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
      extra: {
        name: "USD₮0",
        version: "1",
      },
    };
  }
  return null;
});

server.register("eip155:195", exactEvmScheme);

let isInitialized = false;
const initializeServer = async () => {
  try {
    await server.initialize();
    console.log("OKX X402 Deployment Resource Server initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize OKX X402 Facilitator connection:", err);
  }
};

const handler = async (req: NextRequest): Promise<NextResponse<any>> => {
  return NextResponse.json({
    status: "success",
    message: "Portfolio deployment payment authenticated successfully.",
  }) as NextResponse<any>;
};

export async function POST(req: NextRequest): Promise<NextResponse<any>> {
  if (!isInitialized) {
    await initializeServer();
    isInitialized = true;
  }

  const wrappedHandler = withX402(
    handler,
    {
      accepts: [
        {
          scheme: "exact",
          payTo: process.env.SELLER_WALLET_ADDRESS || "0xD60380f76aab3D2DE12070B48420861D16ED5adC",
          price: {
            amount: "20000", // 0.02 USDC (6 decimals)
            asset: process.env.NEXT_PUBLIC_TESTNET_USDC_ADDRESS || "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
            extra: {
              name: "USD₮0",
              version: "1",
            }
          },
          network: "eip155:195",
        }
      ],
      description: "Charge $0.02 USD equivalent to deploy the WhaleWhisper Portfolio on X Layer Testnet",
    },
    server,
    undefined,
    undefined,
    false
  );

  try {
    return await wrappedHandler(req);
  } catch (err: any) {
    console.error("X402 deployment routing error:", err);
    return NextResponse.json(
      { error: "Payment required challenge header validation failed." },
      { status: 402, headers: { "WWW-Authenticate": "X402" } }
    ) as NextResponse<any>;
  }
}
