import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  trustWallet,
  binanceWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { bscTestnet } from "wagmi/chains";

/**
 * Gate check findings (see conversation for full detail):
 *
 * 1. RainbowKit 2.2.11's peer dependency is wagmi ^2.9.0, NOT wagmi v3
 *    (latest on npm). Installed wagmi@2.19.5 explicitly -- `wagmi@latest`
 *    would silently break RainbowKit.
 *
 * 2. getDefaultConfig() pulls in RainbowKit's full default wallet list,
 *    which includes Coinbase's "Base Account" connector. That connector
 *    imports @coinbase/cdp-sdk, which does a top-level dynamic import of
 *    optional Solana x402 packages (@x402/svm/exact/client) that aren't
 *    installed. Turbopack (this project's bundler) tries to statically
 *    resolve that import during the SSR build and fails hard:
 *    "Module not found: Can't resolve '@x402/svm/exact/client'".
 *    Fix: build the wallet list manually with connectorsForWallets(),
 *    omitting coinbaseWallet/baseAccount entirely -- not needed for a
 *    BSC-only app anyway.
 *
 * 3. A WalletConnect Cloud Project ID (from cloud.reown.com) is required
 *    for the WalletConnect connector to work end-to-end. Falls back to a
 *    placeholder so the app still builds/renders without one; injected
 *    wallets (MetaMask, Trust Wallet, Binance Wallet browser extension)
 *    work regardless.
 */
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, binanceWallet, trustWallet, walletConnectWallet, injectedWallet],
    },
  ],
  { appName: "KaizenScope", projectId }
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [bscTestnet],
  transports: {
    [bscTestnet.id]: http(),
  },
  ssr: true,
});
