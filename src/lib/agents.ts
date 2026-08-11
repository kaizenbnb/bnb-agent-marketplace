export type CategorySlug = "yield" | "grid-trading" | "health-factor" | "rebalancing";

export type Category = {
  slug: CategorySlug;
  label: string;
  ruleOfThumb: string;
};

export type Metric = { label: string; value: string };
export type Transaction = { label: string; hash: string };

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
};

export const EXPLORER_TX_BASE = "https://testnet.bscscan.com/tx/";
export const EXPLORER_ADDRESS_BASE = "https://testnet.bscscan.com/address/";

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
    summary: "Compara APR entre Venus, Aave V3 y Lista; suministra al mejor disponible en la red actual.",
    description:
      "Arquitectura para 3 protocolos. En BSC testnet solo Venus tiene deployment real (Aave V3 y Lista no tienen presencia en chain 97, verificado contra el address-book oficial de Aave y los repos de Lista). El agente lee las 3 tasas, marca las no disponibles con motivo explícito, y ejecuta solo sobre la rama real.",
    status: "live-testnet",
    metrics: [
      { label: "Fuentes evaluadas", value: "3 (Venus, Aave V3, Lista)" },
      { label: "Disponibles en testnet", value: "1 de 3 (solo Venus)" },
      { label: "Protocolo activo", value: "Venus Core Pool — vUSDT" },
    ],
    transactions: [
      { label: "Seed de USDT de prueba", hash: "0x7c77f729d85789d5811ff02d8da9971d0902112cb412c49ec60a4de3a5de2b1c" },
      { label: "Supply en Venus", hash: "0x3cb2f287b53d26077d4169638910ecb7d4b42319899d2e8f9d823ccd3f527672" },
    ],
    caveat:
      "Los importes de USDT minteados en esta fase quedaron afectados por un bug de decimales (18 asumidos vs 6 reales) documentado en AGENT_LOG.md — las tx son reales y verificables, las cifras absolutas de USDT no se muestran aquí por esa razón.",
  },
  {
    id: "health-factor-venus",
    name: "Venus Health Factor Guardian",
    category: "health-factor",
    protocol: "Venus Protocol (Comptroller + vBNB + vUSDT)",
    chain: "BNB Smart Chain Testnet",
    wallet: WALLET,
    summary: "Crea una posición con deuda real, monitoriza el health factor y repaga parcialmente si cae del umbral.",
    description:
      "borrow/repay no están en la skill oficial de Venus Lending (solo-supply) — se componen a mano contra el Comptroller (Unitroller) y vBNB/vUSDT. Colateral: 0.05 tBNB. Borrow: 43.2 USDT reales (90% de la capacidad calculada desde getAccountLiquidity real). El health factor se calculó de forma aislada (colateral BNB real vs deuda real) para evitar la contaminación de una posición legado.",
    status: "live-testnet",
    metrics: [
      { label: "Colateral", value: "0.05 tBNB" },
      { label: "Deuda (borrow)", value: "43.2 USDT reales" },
      { label: "Health Factor inicial", value: "0.9722 (posición en riesgo real)" },
      { label: "Health Factor final", value: "1.3889 (tras repago parcial)" },
      { label: "Umbral configurado", value: "1.15" },
    ],
    transactions: [
      { label: "Borrow (90% de capacidad)", hash: "0x3b4317c9eba9d4734785f61051920d766f82593694ace2e6be40badc28b73775" },
      { label: "Repago parcial (acción protectora)", hash: "0x557c3171ea77fba6c53ccaafbd73719589c5d147c9977b158201c222363392c1" },
    ],
    caveat:
      "El repago se ejecutó por el path admin: repayBorrow() no está soportado vía sesión scoped en @altananetwork/sdk@0.7.0 (NoSpendPermissions sea cual sea el permiso declarado) — documentado en AGENT_LOG.md.",
  },
  {
    id: "grid-pancakeswap-v2",
    name: "PancakeSwap Grid Bot",
    category: "grid-trading",
    protocol: "PancakeSwap V2 (Router)",
    chain: "BNB Smart Chain Testnet",
    wallet: WALLET,
    summary: "Vigila el precio del par WBNB/BUSD y dispara un swap al cruzar un umbral de la rejilla.",
    description:
      "No hay skill de grid trading en Altana — se compone con getAmountsOut + swapExactETHForTokens/swapExactTokensForETH más un loop de umbrales propio. El primer par candidato (WBNB/USDT-Venus) estaba inflado por un bug de decimales ajeno; se usó WBNB/BUSD-testnet oficial, razonablemente escalado (12.5 WBNB de reserva). Rejilla calibrada a 0.4% de paso según el capital real disponible.",
    status: "live-testnet",
    metrics: [
      { label: "Par", value: "WBNB / BUSD (testnet oficial)" },
      { label: "Rejilla", value: "5 niveles, paso 0.4%" },
      { label: "Tamaño de orden", value: "0.05 BNB" },
      { label: "Movimiento tras kick-off", value: "-0.763% vs precio base" },
    ],
    transactions: [
      { label: "Kick-off: venta inicial (BNB → BUSD)", hash: "0xa5c689a0a3684935cf6d1446eaad9a3903c8471f152be9cd1b42debd58706e91" },
    ],
    caveat:
      "Solo se registró 1 cruce de rejilla real en la ventana de prueba por falta de actividad externa en el pool — el mecanismo de umbral quedó verificado, no es un rebalanceador en bucle continuo desplegado 24/7.",
  },
  {
    id: "rebalancing-pancakeswap-v3",
    name: "PancakeSwap V3 Range Manager",
    category: "rebalancing",
    protocol: "PancakeSwap V3 (NonfungiblePositionManager)",
    chain: "BNB Smart Chain Testnet",
    wallet: WALLET,
    summary: "Abre una posición de liquidez concentrada y la reposiciona una vez a un rango desplazado.",
    description:
      "No hay skill de liquidez V3 en Altana (solo V2) ni de rebalancing — todo compuesto a mano contra el NonfungiblePositionManager de testnet (dirección distinta de mainnet). Gate de infraestructura en 2 partes antes de construir: V3 desplegado en testnet (sí) y pool con liquidez sana (WBNB/BUSD V3 estaba vacío en los 4 fee tiers; WBNB/USDT-oficial al 0.25% sí tenía liquidez real).",
    status: "live-testnet",
    metrics: [
      { label: "Pool", value: "WBNB / USDT-oficial, fee 0.25%" },
      { label: "Posición A (cerrada)", value: "tokenId 36781, rango [-24950, -23900]" },
      { label: "Posición B (activa)", value: "tokenId 36782, rango [-24700, -23650]" },
      { label: "Desplazamiento del rango", value: "+250 ticks (5 tickSpacings)" },
    ],
    transactions: [
      { label: "Mint posición A", hash: "0xd4b3d1a5f51960da3086d134017f9af8487229d11b90c2419dc97738012d857b" },
      { label: "Ajuste real: cierre de A (decreaseLiquidity + collect)", hash: "0x485da2875edf17055307b52f4e18e47cdda5b419ce64453a02787f7fe7e022df" },
      { label: "Reposicionar: mint posición B", hash: "0x5ae725b19bccdf05f256051493170eea5c00f20f0386f1f4f3187dd1fecebd24" },
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
