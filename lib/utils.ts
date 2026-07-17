import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  native?: boolean;
}

export const TOKEN_REGISTRY: TokenInfo[] = [
  { symbol: "OKB", address: "", decimals: 18, native: true },
  { symbol: "BTC", address: process.env.NEXT_PUBLIC_TESTNET_BTC_ADDRESS || "0x1111111111111111111111111111111111111111", decimals: 18 },
  { symbol: "ETH", address: process.env.NEXT_PUBLIC_TESTNET_ETH_ADDRESS || "0x2222222222222222222222222222222222222222", decimals: 18 },
  { symbol: "SOL", address: process.env.NEXT_PUBLIC_TESTNET_SOL_ADDRESS || "0x3333333333333333333333333333333333333333", decimals: 18 },
  { symbol: "POPCAT", address: process.env.NEXT_PUBLIC_TESTNET_POPCAT_ADDRESS || "0x4444444444444444444444444444444444444444", decimals: 18 },
  { symbol: "USDC", address: process.env.NEXT_PUBLIC_TESTNET_USDC_ADDRESS || "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d", decimals: 6 },
  { symbol: "USDT", address: process.env.NEXT_PUBLIC_TESTNET_USDT_ADDRESS || "0x67a15159048a1c8411c84b423f03b8420b9e29b4", decimals: 6 }
];

export const MOCK_TOKEN_PRICES: Record<string, number> = {
  OKB: 50.0,
  BTC: 90000.0,
  ETH: 3000.0,
  SOL: 150.0,
  POPCAT: 1.0,
  USDC: 1.0,
  USDT: 1.0
};
