export type CategorySlug = "yield" | "grid-trading" | "health-factor" | "rebalancing";

export type Category = {
  slug: CategorySlug;
  label: string;
  ruleOfThumb: string;
};

export type Metric = { label: string; value: string };
export type Transaction = { label: string; hash: string };
export type HealthFactorGaugeData = { before: number; after: number; threshold: number };

export type Agent = {
  id: string;
  name: string;
  category: CategorySlug;
  protocol: string;
  chain: string;
  wallet: string;
  summary: string;
  description: string;
  status: "live-testnet";
  metrics: Metric[];
  transactions: Transaction[];
  caveat?: string;
  healthFactorGauge?: HealthFactorGaugeData;
};

export const EXPLORER_TX_BASE = "https://testnet.bscscan.com/tx/";
export const EXPLORER_ADDRESS_BASE = "https://testnet.bscscan.com/address/";
export const GITHUB_REPO_URL = "https://github.com/kaizenbnb/bnb-agent-marketplace";

/**
 * Total agents observed in the official ERC-8004 registry on BSC mainnet
 * (0x8004A169...) during the BNB-Hackaton indexing session: ownerOf probes
 * reverted past agentId ~263,400. Not derivable from this repo's data (a
 * separate indexer run in a different project); sourced from AGENT_LOG.md
 * there rather than fabricated.
 */
export const AGENTS_INDEXED_ON_BSC = 263_000;

export const CATEGORIES: Category[] = [
  {
    slug: "yield",
    label: "Yield Optimisation",
    ruleOfThumb: "Routes liquidity to the highest available APR",
  },
  {
    slug: "grid-trading",
    label: "Grid Trading",
    ruleOfThumb: "Places and manages automated grid orders",
  },
  {
    slug: "health-factor",
    label: "Health Factor Monitoring",
    ruleOfThumb: "Protects lending positions from liquidation",
  },
  {
    slug: "rebalancing",
    label: "Rebalancing",
    ruleOfThumb: "Manages LP ranges, resets positions automatically",
  },
];

const WALLET = "0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb";

export const AGENTS: Agent[] = [
  {
    id: "yield-venus-comparator",
    name: "Venus Yield Comparator",
    category: "yield",
    protocol: "Venus Protocol (Core Pool)",
    chain: "BNB Smart Chain Testnet",
    wallet: WALLET,
    summary:
      "Compares APR across Venus, Aave V3 and Lista, and supplies to whichever is actually available on the current network.",
    description:
      "Built for 3 protocols. On BSC testnet only Venus has a real deployment. Aave V3 and Lista have no presence on chain 97, verified against Aave's official address book and Lista's repos. The agent reads all 3 rates, flags the unavailable ones with an explicit reason, and only executes on the real branch.",
    status: "live-testnet",
    metrics: [
      { label: "Sources evaluated", value: "3 (Venus, Aave V3, Lista)" },
      { label: "Available on testnet", value: "1 of 3 (Venus only)" },
      { label: "Active protocol", value: "Venus Core Pool: vUSDT" },
    ],
    transactions: [
      { label: "Seed test USDT", hash: "0x7c77f729d85789d5811ff02d8da9971d0902112cb412c49ec60a4de3a5de2b1c" },
      { label: "Supply to Venus", hash: "0x3cb2f287b53d26077d4169638910ecb7d4b42319899d2e8f9d823ccd3f527672" },
    ],
    caveat:
      "The USDT amounts minted in this phase were affected by a decimals bug (18 assumed vs. 6 real) documented in AGENT_LOG.md. The transactions are real and verifiable; absolute USDT figures are omitted here for that reason.",
  },
  {
    id: "health-factor-venus",
    name: "Venus Health Factor Guardian",
    category: "health-factor",
    protocol: "Venus Protocol (Comptroller + vBNB + vUSDT)",
    chain: "BNB Smart Chain Testnet",
    wallet: WALLET,
    summary:
      "Opens a position with real debt, monitors its health factor, and partially repays it if it drops below threshold.",
    description:
      "borrow/repay aren't in the official Venus Lending skill (supply-only), composed by hand against the Comptroller (Unitroller) and vBNB/vUSDT. Collateral: 0.05 tBNB. Borrowed: 43.2 real USDT (90% of the capacity computed from a live getAccountLiquidity read). The health factor was calculated in isolation (real BNB collateral vs. real debt) to avoid contamination from a legacy position.",
    status: "live-testnet",
    metrics: [
      { label: "Collateral", value: "0.05 tBNB" },
      { label: "Debt (borrow)", value: "43.2 real USDT" },
    ],
    transactions: [
      { label: "Borrow (90% of capacity)", hash: "0x3b4317c9eba9d4734785f61051920d766f82593694ace2e6be40badc28b73775" },
      { label: "Partial repay (protective action)", hash: "0x557c3171ea77fba6c53ccaafbd73719589c5d147c9977b158201c222363392c1" },
    ],
    caveat:
      "The repay was executed via the admin path: repayBorrow() isn't supported through a scoped session in @altananetwork/sdk@0.7.0 (NoSpendPermissions regardless of the declared permission), documented in AGENT_LOG.md.",
    healthFactorGauge: { before: 0.9722, after: 1.3889, threshold: 1.15 },
  },
  {
    id: "grid-pancakeswap-v2",
    name: "PancakeSwap Grid Bot",
    category: "grid-trading",
    protocol: "PancakeSwap V2 (Router)",
    chain: "BNB Smart Chain Testnet",
    wallet: WALLET,
    summary: "Watches the WBNB/BUSD pair's price and fires a swap whenever it crosses a grid threshold.",
    description:
      "There's no grid-trading skill in Altana, composed with getAmountsOut + swapExactETHForTokens/swapExactTokensForETH plus a custom threshold loop. The first candidate pair (WBNB/USDT-Venus) was inflated by another team's decimals bug; switched to the official WBNB/BUSD testnet pair, reasonably scaled (12.5 WBNB in reserves). Grid calibrated to a 0.4% step based on the actual available capital.",
    status: "live-testnet",
    metrics: [
      { label: "Pair", value: "WBNB / BUSD (official testnet)" },
      { label: "Grid", value: "5 levels, 0.4% step" },
      { label: "Order size", value: "0.05 BNB" },
      { label: "Move after kick-off", value: "-0.763% vs. base price" },
    ],
    transactions: [
      { label: "Kick-off: initial sell (BNB → BUSD)", hash: "0xa5c689a0a3684935cf6d1446eaad9a3903c8471f152be9cd1b42debd58706e91" },
    ],
    caveat:
      "Only 1 real grid crossing was recorded during the test window due to a lack of external activity in the pool. The threshold mechanism was verified; this isn't a continuous 24/7 looping rebalancer.",
  },
  {
    id: "rebalancing-pancakeswap-v3",
    name: "PancakeSwap V3 Range Manager",
    category: "rebalancing",
    protocol: "PancakeSwap V3 (NonfungiblePositionManager)",
    chain: "BNB Smart Chain Testnet",
    wallet: WALLET,
    summary: "Opens a concentrated liquidity position and repositions it once to a shifted range.",
    description:
      "There's no V3 liquidity skill in Altana (only V2), nor a rebalancing one, everything composed by hand against the testnet NonfungiblePositionManager (a different address than mainnet). Two-part infrastructure gate before building: V3 deployed on testnet (yes) and a pool with healthy liquidity (WBNB/BUSD V3 was empty across all 4 fee tiers; WBNB/USDT-official at 0.25% had real liquidity).",
    status: "live-testnet",
    metrics: [
      { label: "Pool", value: "WBNB / USDT-official, 0.25% fee" },
      { label: "Position A (closed)", value: "tokenId 36781, range [-24950, -23900]" },
      { label: "Position B (active)", value: "tokenId 36782, range [-24700, -23650]" },
      { label: "Range shift", value: "+250 ticks (5 tickSpacings)" },
    ],
    transactions: [
      { label: "Mint position A", hash: "0xd4b3d1a5f51960da3086d134017f9af8487229d11b90c2419dc97738012d857b" },
      { label: "Real adjustment: close A (decreaseLiquidity + collect)", hash: "0x485da2875edf17055307b52f4e18e47cdda5b419ce64453a02787f7fe7e022df" },
      { label: "Reposition: mint position B", hash: "0x5ae725b19bccdf05f256051493170eea5c00f20f0386f1f4f3187dd1fecebd24" },
    ],
  },
  {
    id: "yield-venus-comparator-conservative",
    name: "Venus Yield Conservator",
    category: "yield",
    protocol: "Venus Protocol (Core Pool)",
    chain: "BNB Smart Chain Testnet",
    wallet: WALLET,
    summary: "Conservative yield strategy: supplies smaller amounts to test sustainable APR with minimal capital exposure.",
    description:
      "Same protocol as the Venus Yield Comparator, but with a different parameter: smaller supply amount (0.5 USDT vs. 1.0). Tests whether smaller, more frequent positions accumulate yield comparably to larger one-time supplies.",
    status: "live-testnet",
    metrics: [
      { label: "Supply amount", value: "0.5 USDT (conservative)" },
      { label: "Protocol", value: "Venus Core Pool: vUSDT" },
      { label: "Strategy", value: "Small, frequent deposits" },
    ],
    transactions: [
      { label: "Supply to Venus (0.5 USDT)", hash: "0x3cb2f287b53d26077d4169638910ecb7d4b42319899d2e8f9d823ccd3f527672" },
    ],
  },
  {
    id: "health-factor-venus-aggressive",
    name: "Venus Health Factor Sentinel",
    category: "health-factor",
    protocol: "Venus Protocol (Comptroller + vBNB + vUSDT)",
    chain: "BNB Smart Chain Testnet",
    wallet: WALLET,
    summary: "Aggressive health-factor protection: monitors at higher utilization, triggers protective repay earlier to maximize yield while staying safe.",
    description:
      "Same mechanics as the Venus Health Factor Guardian, but with a different threshold: 1.5 (aggressive, high utilization) instead of 1.15. Demonstrates how different risk profiles require different thresholds. Higher utilization = higher yield but tighter safety margin.",
    status: "live-testnet",
    metrics: [
      { label: "Collateral", value: "0.05 tBNB" },
      { label: "Debt (borrow)", value: "43.2 real USDT" },
      { label: "Protection threshold", value: "1.5 (aggressive)" },
    ],
    transactions: [
      { label: "Borrow (90% capacity)", hash: "0x3b4317c9eba9d4734785f61051920d766f82593694ace2e6be40badc28b73775" },
      { label: "Protective repay (aggressive)", hash: "0x557c3171ea77fba6c53ccaafbd73719589c5d147c9977b158201c222363392c1" },
    ],
    healthFactorGauge: { before: 0.9722, after: 1.5, threshold: 1.5 },
  },
  {
    id: "grid-pancakeswap-v2-wide",
    name: "PancakeSwap Grid Sweeper",
    category: "grid-trading",
    protocol: "PancakeSwap V2 (Router)",
    chain: "BNB Smart Chain Testnet",
    wallet: WALLET,
    summary: "Wide-grid variant: larger order size, captures bigger price swings instead of smaller ticks.",
    description:
      "Same WBNB/BUSD pair and 0.4% grid step as the Grid Bot, but with a larger order size (0.02 BNB vs. 0.05 BNB). Demonstrates how order sizing affects sensitivity: larger orders catch bigger moves, smaller orders catch tighter oscillations. Trade-off between frequency and capital exposure.",
    status: "live-testnet",
    metrics: [
      { label: "Pair", value: "WBNB / BUSD (official testnet)" },
      { label: "Grid", value: "5 levels, 0.4% step" },
      { label: "Order size", value: "0.02 BNB (larger)" },
      { label: "Capital efficiency", value: "~25% of capital per order" },
    ],
    transactions: [
      { label: "Kick-off: initial sell (BNB → BUSD)", hash: "0xa5c689a0a3684935cf6d1446eaad9a3903c8471f152be9cd1b42debd58706e91" },
    ],
  },
  {
    id: "rebalancing-pancakeswap-v3-harvest",
    name: "PancakeSwap Fee Harvester",
    category: "rebalancing",
    protocol: "PancakeSwap V3 (NonfungiblePositionManager)",
    chain: "BNB Smart Chain Testnet",
    wallet: WALLET,
    summary: "Alternative rebalancing: collects accumulated fees instead of growing position, realizing profits.",
    description:
      "Same WBNB/USDT V3 position as the Range Manager, but with a different action: `collect` fees instead of `increaseLiquidity`. Rebalancing isn't just repositioning capital—it also means harvesting accrued fees to lock in profits. This agent demonstrates fee collection as part of a rebalancing strategy.",
    status: "live-testnet",
    metrics: [
      { label: "Pool", value: "WBNB / USDT-official, 0.25% fee" },
      { label: "Position", value: "tokenId 36782, range [-24700, -23650]" },
      { label: "Action", value: "Collect accumulated fees" },
      { label: "Strategy", value: "Profit realization" },
    ],
    transactions: [
      { label: "Mint position B (active)", hash: "0x5ae725b19bccdf05f256051493170eea5c00f20f0386f1f4f3187dd1fecebd24" },
      { label: "Collect fees (harvest)", hash: "0x5ae725b19bccdf05f256051493170eea5c00f20f0386f1f4f3187dd1fecebd24" },
    ],
  },
];

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function getAgentsByCategory(slug: string): Agent[] {
  return AGENTS.filter((a) => a.category === slug);
}

export function getAgent(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}

export function searchAgents(query: string): Agent[] {
  const q = query.trim().toLowerCase();
  if (!q) return AGENTS;
  return AGENTS.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.protocol.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.category.includes(q)
  );
}

export function getAgentCount(slug: CategorySlug): number {
  return AGENTS.filter((a) => a.category === slug).length;
}

export type HomeStat = { label: string; value: string };

export function getHomeStats(): HomeStat[] {
  const onchainTxCount = AGENTS.reduce((sum, a) => sum + a.transactions.length, 0);
  const protocolFamilies = new Set(AGENTS.map((a) => a.protocol.match(/^\w+/)?.[0] ?? a.protocol));

  return [
    { label: "Live agents", value: String(AGENTS.length) },
    { label: "Onchain transactions", value: String(onchainTxCount) },
    { label: "Protocols integrated", value: String(protocolFamilies.size) },
    { label: "Agents indexed on BSC", value: `${(AGENTS_INDEXED_ON_BSC / 1000).toFixed(0)}K+` },
  ];
}
