# KaizenScope

![KaizenScope demo: home, task chip, agent detail, hiring, two settled transactions](docs/demo.gif)

An intent-first marketplace for hiring ERC-8004 agents on BNB Smart Chain: pick a task, see the real agent live for it, hire in one click via x402.

## The problem

The official ERC-8004 registry on BSC mainnet (`0x8004A169...`) holds roughly **263,000 registered agents**. None of them expose onchain reputation in a form a user can actually compare. None of them are DeFi-native. The registration front is dominated by generic-task and payment-bot factories (Quack AI gasless bots, EvoEvo clones, meme-token spam), not agents that manage yield, liquidity or lending positions. Finding an agent for a real DeFi task means wading through noise with no comparison surface.

## The solution

KaizenScope turns "I need an agent that does X" into a task-first lookup, not a registry dump. Pick a task chip (yield optimisation, grid trading, health factor monitoring, rebalancing) and get an agent with real onchain activity for that category, not registry metadata. Today that's 1 verified agent per category (4 total); the comparison table view, multiple agents ranked side by side per category, is the next step once more DeFi-native agents exist to compare. Hiring is a real x402 payment: the agent doesn't just take your money, it executes its billable action onchain and hands back proof of both.

The 4 agents listed are curated, not a live feed of the ERC-8004 registry. We indexed the BSC registry (see [`agents/indexer/`](agents/indexer/) and [`agents/output/`](agents/output/)) and found no DeFi-native agents in it: the registration front is Quack AI gasless bots, EvoEvo clones and meme-token spam, none of which declare a category the marketplace's rubric (yield, grid, health factor, rebalancing) can use. Wiring the home page to the live registry would mean showing that noise, not a comparison. So the app ships 4 verified, hand-built agents instead: real onchain activity a user can actually evaluate, until the registry itself has DeFi agents worth surfacing live.

## Agents

4 agents, live on BNB Smart Chain Testnet, each built by hand against its protocol (no Altana skill covers borrow/repay, V3 liquidity, or grid logic; see [Architecture](#architecture)).

All 4 currently share one agentic wallet (`0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb`) rather than one wallet each: a shortcut taken to ship the x402 flow across all 4 agents first; per-agent wallets are the next infra step, not yet done. Every metric shown in the app (health factor before/after, grid step, position ranges) is read from a real onchain transaction. The "Work tx" column below is each agent's actual billable action, not a placeholder.

| Agent | Category | Protocol | Wallet | Work tx |
|---|---|---|---|---|
| Venus Yield Comparator | Yield Optimisation | Venus Protocol (Core Pool) | [BscScan](https://testnet.bscscan.com/address/0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb) | [Supply to Venus](https://testnet.bscscan.com/tx/0x3cb2f287b53d26077d4169638910ecb7d4b42319899d2e8f9d823ccd3f527672) |
| Venus Health Factor Guardian | Health Factor Monitoring | Venus Protocol (Comptroller + vBNB + vUSDT) | [BscScan](https://testnet.bscscan.com/address/0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb) | [Protective repay](https://testnet.bscscan.com/tx/0x557c3171ea77fba6c53ccaafbd73719589c5d147c9977b158201c222363392c1) |
| PancakeSwap Grid Bot | Grid Trading | PancakeSwap V2 (Router) | [BscScan](https://testnet.bscscan.com/address/0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb) | [Kick-off swap](https://testnet.bscscan.com/tx/0xa5c689a0a3684935cf6d1446eaad9a3903c8471f152be9cd1b42debd58706e91) |
| PancakeSwap V3 Range Manager | Rebalancing | PancakeSwap V3 (NonfungiblePositionManager) | [BscScan](https://testnet.bscscan.com/address/0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb) | [Reposition (mint B)](https://testnet.bscscan.com/tx/0x5ae725b19bccdf05f256051493170eea5c00f20f0386f1f4f3187dd1fecebd24) |

## How hiring works: x402

Hiring is a real three-step x402 handshake against `POST /api/hire/[agentId]`, not a mocked paywall:

1. **Request terms.** First call, no payment header → the server responds `402 Payment Required` with the payment requirements (`scheme: "permit2"`, asset, amount, `payTo`). Plain Permit2 was chosen over B402's witness-binding `permit2-exact` because Permit2 is deployed at the same canonical address on every chain, including testnet. No extra infrastructure to stand up.
2. **Authorize and hire.** The client signs a Permit2 `PermitTransferFrom` authorization and re-sends the same request with an `X-PAYMENT` header. The server:
   - **Validates** the authorization without writing to the blockchain (checks nonce is unused, deadline hasn't passed, owner has sufficient balance and allowance).
   - **Executes the agent's work** (e.g. supply to Venus, fire a grid swap, grow a V3 position).
   - **Only if work succeeds**, relays `Permit2.permitTransferFrom` onchain to capture the payment.

The response carries **two transaction hashes**, not one: the payment settlement and the agent's work. A hire that only charges isn't a hire. **If the agent's work fails, the payment is never captured—no charge occurs.**

```
res1 = POST /api/hire/:id            → 402 { accepts: [...] }
res2 = POST /api/hire/:id            → { payment: { txHash }, work: { txHash } }
       X-PAYMENT: <base64 permit2 authorization>
```

### Atomicity note

The payment is **conditional on work success**, not cryptographically atomic. The work executes first; only if it succeeds does the server relay the payment. If the work succeeds but payment settlement fails (network issue), the response signals the anomaly (502) with both hashes for manual reconciliation. True atomic capture would require an escrow contract; this design trades escrow complexity for deterministic work-first execution.

## Architecture

```
┌─────────────┐     task chip / search      ┌──────────────────┐
│   Browser    │ ───────────────────────────▶│  Next.js App     │
│  (KaizenScope)│◀─────────────────────────── │  Router (RSC)     │
└─────────────┘     agent card + detail page  └──────┬───────────┘
                                                       │
                                       POST /api/hire/[agentId]
                                                       │
                                    ┌──────────────────▼──────────────────┐
                                    │  x402 merchant (route.ts)            │
                                    │  1. no payment  → 402 + requirements │
                                    │  2. X-PAYMENT    → settle + execute  │
                                    └──────┬─────────────────┬────────────┘
                                           │                 │
                              Permit2.permitTransferFrom   agent work action
                              (payment settlement)          (supplyToVenus,
                                           │                 fireGridSwap,
                                           ▼                 growPositionB, …)
                                ┌────────────────────────────────────┐
                                │   BNB Smart Chain Testnet (viem)     │
                                │   Venus · PancakeSwap V2 · V3        │
                                └────────────────────────────────────┘
```

Agent data (`src/lib/agents.ts`) is static: why is covered under [The solution](#the-solution) above, not repeated here.

## Notable engineering decisions

- No Altana SDK skill covers borrow/repay, PancakeSwap V3 liquidity, or grid trading. All four agents compose calls by hand against the underlying contracts (Comptroller, NonfungiblePositionManager, Router).
- Two of the four agents' state-changing calls (`redeem`/`repayBorrow` on Venus) can't run through an Altana scoped session, `NoSpendPermissions` regardless of the declared permission, so those specific calls go through the admin execution path instead.
- Testnet USDT is 6 decimals, not the 18 documented in Venus's mainnet-oriented SKILL.md; verifying `decimals()` against the real testnet contract, not the docs, is what caught it.
- The full build log, every bug, its root cause, the fix, and the lesson, is in [`agents/AGENT_LOG.md`](agents/AGENT_LOG.md). The agent-building work itself (indexer, wallets, raw scripts) is in [`agents/`](agents/).
- [`agents/AGENT_ADVANTAGE_REPORT.md`](agents/AGENT_ADVANTAGE_REPORT.md) compares 3 of the 4 tasks (including grid trading) done manually vs. hired through the agent: real transactions only, manual-cost figures labeled as real (cited from agents/AGENT_LOG.md) or estimated.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, React 19, Server Actions) + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [viem](https://viem.sh) for all onchain reads/writes against BSC Testnet
- [`@altananetwork/sdk`](https://www.npmjs.com/package/@altananetwork/sdk) for scoped-session agent execution (Venus supply/borrow path)
- pnpm

## Running locally

```bash
pnpm install
```

Create `.env.local` with:

```
WALLET_ADDRESS=<agentic wallet address, 0x5bc1C0...>
ADMIN_PRIVATE_KEY=<admin key for the agent wallet, testnet only, never commit>
X402_SESSION_SIGNER_KEY=<key used to sign the demo's Permit2 payment>
```

```bash
pnpm dev
```

The app runs on [http://localhost:3100](http://localhost:3100).

No wallet extension is wired up client-side. The demo signs the x402 Permit2 payment server-side via a Server Action, since there's no browser wallet connection in this build. See `src/app/actions/hire.ts`.

**[`docs/USAGE.md`](docs/USAGE.md)** is the full operating guide: the walkthrough, what the two returned hashes prove, why the hire takes ~30s, per-hire testnet cost, how to refund the wallet when tBNB runs out (the faucet needs mainnet BNB *and* a human-solved CAPTCHA), and a troubleshooting table.
