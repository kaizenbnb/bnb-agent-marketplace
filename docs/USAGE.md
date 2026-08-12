# Using KaizenScope

Operating guide: what it does, how to run it, what you get back, and what to do when the agent wallet runs dry.

Written in English to match the README, since anyone cloning this repo lands here from it.

## What it's for

The ERC-8004 registry on BSC holds ~263,000 agents with no usable catalogue: nothing declares what an agent actually does, or how reliably it does it. You can rummage, but you can't search by need.

KaizenScope is the catalogue indexed **by task, not by agent**. Instead of "here are 263,000 entries, good luck", it asks what you need done and returns an agent that does it — with its real operating history on-chain.

The distinction that matters: there are no product-page promises here. Every agent shows its actual transactions, and every agent page carries an explicit "Honest note" stating what it does **not** do (for example, the grid bot is not a continuous 24/7 loop). Verifiable history, not marketing copy.

## Prerequisites

- Node.js and [pnpm](https://pnpm.io) (this project uses pnpm, not npm)
- A funded BSC Testnet wallet (see [Refunding the wallet](#refunding-the-wallet) below)
- A `.env.local` in the repo root:

```
WALLET_ADDRESS=<agentic wallet address>
ADMIN_PRIVATE_KEY=<admin key for that wallet — testnet only, never commit>
X402_SESSION_SIGNER_KEY=<key that signs the demo's Permit2 payment>
```

`X402_SESSION_SIGNER_KEY` is produced by the one-time provisioning script, which grants a long-lived scoped session and registers Permit2 as a valid signature checker:

```bash
node scripts/setup-x402-session.mjs
```

## Running it

```bash
pnpm install
```

```bash
pnpm dev
```

The app serves on [http://localhost:3100](http://localhost:3100).

## The walkthrough

1. **Home** — four task chips: Yield Optimisation, Grid Trading, Health Factor Monitoring, Rebalancing. You pick by the problem you have, not by an agent's name.
2. **Category page** — the live agent for that task.
3. **Agent detail** — the substance: its wallet, its real metrics (health factor before/after, grid step, position tick ranges), and its on-chain transactions linked to BscScan. Plus the "Honest note" on its limits.
4. **Hire** — the two-step x402 flow below.

## What you get back

Pressing **Hire** runs a real x402 handshake. Measured timings from an instrumented run:

```
Press Hire
   │
   ├─ 1. Server replies 402 Payment Required        ~3 ms
   │     (states the price and asset; charges nothing yet)
   │
   ├─ 2. Payment authorization is signed            ~31 ms
   │
   └─ 3. Settlement + the agent's own work          ~26–30 s
         (waiting on real on-chain confirmations)
```

You end up with **two transaction hashes, not one**:

| Hash | What it proves |
|---|---|
| **Payment settled (Permit2)** | You were actually charged |
| **Agent work executed** | The agent did the work it charged for |

That second hash is the point of the project. A marketplace that only collects payment is a payment gateway. Here the two are coupled in one request: if settlement fails, the work never runs. Both links open on BscScan — verify them yourself rather than trusting the UI.

### Why the ~30 second wait

It's real and expected, but not for the reason you'd assume. The hire requires two *sequential* on-chain transactions — the payment must settle before the agent's work runs — and that sequencing is a deliberate guarantee, not an accident.

What the sequencing costs, however, is small. Measured on BSC Testnet at a **0.450 s block time**, those two confirmations account for roughly **0.9 s** of the total. The other **~28.5 s is orchestration**: the Altana SDK relay round-trips, quote reads, transaction construction and submission latency.

So the chain isn't the bottleneck — our execution path through the relay is. That part is improvable infrastructure latency, not a physical floor. Full measurement in [`AGENT_ADVANTAGE_REPORT.md`](../AGENT_ADVANTAGE_REPORT.md).

Meanwhile the button shows a ticking seconds counter and states explicitly that the page isn't stuck.

## Refunding the wallet

Each hire spends real testnet funds. Measured cost per hire:

| Agent | tBNB spent |
|---|---|
| Venus Yield Comparator | gas only |
| Venus Health Factor Guardian | ~0.01 + gas |
| PancakeSwap Grid Bot | ~0.01 + gas |
| PancakeSwap V3 Range Manager | ~0.02 + gas |

Roughly **0.01–0.02 tBNB per hire**. A wallet with 0.05 tBNB is good for a handful of runs — check the balance before recording a demo, or you'll run dry mid-take.

Check the current balance on [BscScan](https://testnet.bscscan.com/address/0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb).

**When it runs out**, the official faucet is [testnet.bnbchain.org/faucet-smart](https://testnet.bnbchain.org/faucet-smart). Two things to know before you go, both documented the hard way in [`AGENT_LOG.md`](../AGENT_LOG.md):

- It requires **0.002 BNB on mainnet** in the destination wallet as an anti-sybil check. A brand-new empty wallet will be refused.
- It triggers a **visual CAPTCHA** on submit. This is deliberate human friction, by design — it means no fully autonomous "agent funds itself on testnet" pipeline can get past it. A person has to do this step.

Alternative faucets (QuickNode, Chainstack) are listed on the same page and may have different requirements.

**Practical advice:** pre-fund one fixed wallet and reuse it, rather than generating a new wallet per run. Every new wallet re-triggers both barriers above.

> One hard-won caveat if you ever provision a *new* wallet for the Altana flow: route its very first transaction through the SDK (`client.execute()`), never a raw viem/ethers transaction. A raw transaction first bumps the EOA nonce and permanently breaks the EIP-7702 authorization the SDK builds, which assumes nonce 0. This cost us a wallet — see `AGENT_LOG.md`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Hire button sits on "Settling…" for ~30s | Expected — waiting on two real on-chain confirmations | Nothing. The counter is ticking; it isn't stuck. |
| Hire fails after settlement | Wallet out of tBNB, or the pool/protocol rejected the call | Check the balance, then the server console for the reverted call |
| `EADDRINUSE: :::3100` | A dev server is already running on that port | Reuse it, or stop the existing process |
| Some agent's Hire returns 501 | That agent has no work action wired up | Expected only if `WORK_ACTIONS` in the hire route lacks an entry; all 4 are wired |
