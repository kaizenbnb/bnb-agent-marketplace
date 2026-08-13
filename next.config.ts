import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * RainbowKit's bundled Coinbase "Base Account" connector statically
   * imports @coinbase/cdp-sdk, which in turn does an unconditional
   * dynamic import() of optional Solana x402 packages that aren't
   * installed (@x402/svm/exact/client, @x402/core/client). Turbopack
   * tries to resolve that import target during the SSR build of the
   * client-component tree and fails hard. Neither package is ever
   * exercised by this app (BSC-only, no Coinbase Smart Wallet, no
   * Solana), so mark them external: Next won't try to bundle/resolve
   * them for the server, and the browser bundle only touches them if
   * a user actually picks that connector (which isn't offered here).
   */
  serverExternalPackages: ["@coinbase/cdp-sdk", "@base-org/account"],
};

export default nextConfig;
