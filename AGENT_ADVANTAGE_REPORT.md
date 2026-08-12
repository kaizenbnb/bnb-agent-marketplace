# Agent Advantage Report

Written to satisfy TermiX's Agent Advantage award eligibility requirement: 3 tasks, each compared manually vs. hiring the agent, at least one a trading task.

## Methodology

Two rules, applied strictly:

1. **Every task is anchored on a real, verifiable BSC Testnet transaction — no hypothetical comparisons.** The transactions linked below are the actual on-chain calls executed by the exact library functions (`fireGridSwap`, `addCollateralToVenus`, `growPositionB` in `src/lib/`) that the x402 `/api/hire/[agentId]` endpoint invokes as its work action. A fresh hire call today produces new payment-settlement and work transactions through the same code path; the ones cited here are the completed executions of that same code, already confirmed on-chain.
2. **Manual-cost figures are labeled by source.** Where we have first-hand evidence — because building each agent meant composing these exact calls by hand against raw contracts, since no Altana SDK skill covers borrow/repay, V3 liquidity, or grid logic — that evidence is cited directly from [`AGENT_LOG.md`](./AGENT_LOG.md) with the real minutes spent and the real bug hit, not estimated. Where a figure describes ongoing manual use after that first-time cost (e.g. re-checking a position weeks later), it's marked **ESTIMATE** and kept separate from the real numbers.

No comparison below uses a projected or assumed manual cost as its primary evidence. The primary evidence is always: we did this by hand first, it took a documented amount of time, and it broke in a documented way.

Both sides of the comparison are measured: the manual side in the per-task sections below, the agent side in [The cost of hiring](#the-cost-of-hiring-measured) immediately after.

---

## The cost of hiring, measured

The manual figures in this report come from real build sessions. The agent side is measured too, so the comparison has a number in both columns rather than a number against an impression.

**Method:** a `MutationObserver` instrumented in the live page, timing each state transition of a real hire (no mocks, real payment, real work). Two runs on two different agents, to confirm the profile isn't specific to one code path.

| Phase | Grid Bot | What happens |
|---|---|---|
| `402 Payment Required` returned | **3 ms** | Server states price and asset; charges nothing |
| Permit2 authorization signed | **28 ms** | Off-chain signature |
| Settlement + agent work | **29,192 ms** | Two transactions land on-chain |
| **Total end-to-end** | **29,416 ms** | |

Second run, Venus Health Factor Guardian: **26,307 ms** end-to-end. Same profile.

### How much of that is the chain, and how much is us

This is the part worth being precise about, because the intuitive answer is wrong.

Measured against the two real transactions of the instrumented grid run:

| Measurement | Value |
|---|---|
| BSC Testnet block time (two independent samples) | **0.450 s** |
| Payment settled ([`0xac81…3944`](https://testnet.bscscan.com/tx/0xac81cbf3a9927770f1578a30db14503f06763407f377a86759dd4b16572f3944)) | block 124619341, `2026-08-12T08:57:55Z` |
| Agent work executed ([`0xfa7d…9748`](https://testnet.bscscan.com/tx/0xfa7d848f04f07791a47783101b09ca4ccbd75d7a3cc5de9fe060b9d2823d9748)) | block 124619400, `2026-08-12T08:58:22Z` |
| Elapsed between the two confirmations | **27 s** (59 blocks) |

The hire requires exactly **two sequential on-chain confirmations** — that sequencing is a design guarantee, not an accident: the agent's work must not run unless the payment actually settled. At a 0.450 s block time, those two confirmations cost roughly **0.9 s**. That is the irreducible floor.

The observed total was 29.4 s. So:

- **~0.9 s (≈3%) is chain confirmation** — irreducible, bounded by block time and the two-step guarantee.
- **~28.5 s (≈97%) is orchestration** — everything between: the Altana SDK relay round-trips (`grantSession`, `execute`), quote reads, transaction construction, and relay submission latency.

The chain is not the bottleneck. BSC Testnet confirmed both transactions in under a second of actual block time; the remaining 28.5 s is our own execution path through the SDK relay. We have not decomposed that 28.5 s further into its individual relay calls — doing so needs server-side instrumentation we haven't added — so it is reported as one measured block, not split by guesswork.

**Why this strengthens rather than weakens the comparison:** the agent-side cost is ~29 s against 40–70 minutes of documented manual work per task, and the dominant term in those 29 s is improvable infrastructure latency rather than a physical floor. The manual side's cost is knowledge that has to be re-acquired; the agent side's cost is a relay round-trip that gets faster as the infrastructure does.

---

## Task 1 — Grid Trading (PancakeSwap V2) — trading task

**Agent:** PancakeSwap Grid Bot · WBNB/BUSD · BSC Testnet · [`0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb`](https://testnet.bscscan.com/address/0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb)

**Real transaction:** kick-off sell (BNB → BUSD), the seed trade that gives the grid loop something to react to — [`0xa5c6…06e91`](https://testnet.bscscan.com/tx/0xa5c689a0a3684935cf6d1446eaad9a3903c8471f152be9cd1b42debd58706e91), gas used **248,100**, confirmed on-chain, price moved -0.763% vs. base and crossed the grid threshold as designed.

**Manual path — real, first-hand evidence (AGENT_LOG.md):**
- The first candidate pair, WBNB/USDT-Venus, looked liquid but wasn't: another team had seeded it with the same 18-vs-6-decimals bug we later hit ourselves on Health Factor (below), inflating its reserves ~1,000,000×. A 20 USDT test swap moved the price 0.00% across 10 ticks — undetectable by eyeballing the pair, only caught by checking reserve *magnitude* in human units before committing to it.
- Real cost to correctly select the pair, size the grid, and get one working confirmed crossing: **~55 minutes**, broken down in AGENT_LOG.md as 10 min verifying PancakeSwap V2's testnet deployment, 15 min discovering and discarding the inflated pair, 15 min recalibrating grid step (4% → 0.4%) and order size against real pool depth, 15 min designing and executing the kick-off.
- A purely reactive grid (wait for a crossing, react) never fires on a low-traffic testnet pool with no external activity — this had to be discovered and fixed with an explicit seed trade, not assumed away.

**Manual path — ESTIMATE (steady-state, after the pair/grid is already correctly configured):** continuous price-watching to catch a 0.4%-step crossing requires checking the pool more often than a human can sustain — a grid this tight effectively requires 24/7 attention or it's not a grid, it's an occasional trade. We don't have a real multi-day monitoring log to cite a number here, so we don't give one; the honest claim is qualitative: sustained sub-1%-threshold monitoring is not a task a human does continuously without automation.

**Verdict:** the agent's advantage on this task isn't speed on a single trade — it's that *correctly setting up* a grid against real, unverified pool state is where the real risk and real time went (55 min, one live bug avoided), and once built, the same logic runs unattended on thresholds no human watches continuously.

---

## Task 2 — Health Factor Monitoring (Venus Protocol)

**Agent:** Venus Health Factor Guardian · BSC Testnet · [`0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb`](https://testnet.bscscan.com/address/0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb)

**Real transactions:**
- Borrow (90% of computed capacity, 43.2 real USDT) — [`0x3b43…b7377`](https://testnet.bscscan.com/tx/0x3b4317c9eba9d4734785f61051920d766f82593694ace2e6be40badc28b73775), gas used **646,230**
- Protective partial repay — [`0x557c…3392c1`](https://testnet.bscscan.com/tx/0x557c3171ea77fba6c53ccaafbd73719589c5d147c9977b158201c222363392c1), gas used **284,866**
- Real elapsed time between the two, read from block timestamps: **12 minutes 35 seconds** (block 124434770 → 124436449). This reflects our test run's cadence, not a claim about production monitoring frequency — it's included because it's a real, verifiable number, not a projected one.
- Health factor moved from **0.9722** (genuinely under 1.0 — a real position at real risk, not simulated) to **1.3889** after the repay.

**Manual path — real, first-hand evidence (AGENT_LOG.md), our strongest evidence in this report:**
- borrow()/repayBorrow() aren't covered by Venus's official supply-only skill — we composed them by hand against the Comptroller and vBNB/vUSDT. Doing this exposed a real bug: **we assumed testnet USDT had 18 decimals**, copied from Venus's SKILL.md — which documents mainnet, not testnet. Testnet USDT is actually 6 decimals. Every USDT figure minted and reported before this was caught (a "150 USDT" position reported as fact) was actually 150 *trillion* raw units — a 10¹²× numeric error that we made and only caught by calling `decimals()` against the real contract instead of trusting documentation.
- Separately, `redeem()` and `repayBorrow()` reject *any* Altana scoped-session permission — verified by testing both an exact-amount cap and an effectively unlimited one (`2**200n`), both rejected identically. The same call succeeded immediately via the unscoped admin path. This is a platform-level ceiling, not a configuration mistake: any agent needing to unwind a Compound-fork position hits it.
- Real cost, from AGENT_LOG.md: **~70 minutes** — 15 min reading the Comptroller/oracle ABI (required, since no skill covers this), 20 min debugging the retroactive decimals bug, 25 min diagnosing the session-permission wall (3 failed attempts before isolating the cause), 10 min real execution once both blockers were resolved.

**Manual path — ESTIMATE:** correctly computing a health factor by hand requires reading 4 separate on-chain values (`balanceOf`, `exchangeRateStored`, the oracle price, `borrowBalanceStored`) and applying the Compound HF formula correctly — a calculation with the exact same decimals trap we hit above. We do not have a second independent case of someone else making this mistake to cite, so this stays an estimate: a manual user re-deriving this formula from scratch, without our AGENT_LOG.md lesson in hand, is a plausible candidate to repeat it.

**Verdict:** this is the task where "manual" is genuinely dangerous, not just slow — a decimals error here doesn't just mis-report a number, it can mean reacting to a health factor that's wrong by twelve orders of magnitude while a real position sits under water.

---

## Task 3 — Rebalancing (PancakeSwap V3 concentrated liquidity)

**Agent:** PancakeSwap V3 Range Manager · WBNB/USDT-official, 0.25% fee tier · BSC Testnet · [`0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb`](https://testnet.bscscan.com/address/0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb)

**Real transactions:**
- Mint position A, range `[-24950, -23900]`, tokenId `36781` — [`0xd4b3…c857b`](https://testnet.bscscan.com/tx/0xd4b3d1a5f51960da3086d134017f9af8487229d11b90c2419dc97738012d857b), gas used **653,819**
- Close A (`decreaseLiquidity` + `collect`, full exit) — [`0x485d…7e022df`](https://testnet.bscscan.com/tx/0x485da2875edf17055307b52f4e18e47cdda5b419ce64453a02787f7fe7e022df), gas used **302,004**
- Reposition: mint position B, range `[-24700, -23650]` (+250 ticks), tokenId `36782` — [`0x5ae7…fecebd24`](https://testnet.bscscan.com/tx/0x5ae725b19bccdf05f256051493170eea5c00f20f0386f1f4f3187dd1fecebd24), gas used **638,450**
- The rebalance itself — closing A and minting B — completed in **5 seconds of real block time** (block 124535743 → 124535755). Combined gas for the actual reposition (excluding the initial position open): **940,454**.

**Manual path — real, first-hand evidence (AGENT_LOG.md):**
- No Altana skill covers V3 liquidity at all (only V2), and none covers rebalancing. Every call here — computing a tick range from a target price range, respecting `tickSpacing` alignment, getting `token0`/`token1` order right, extracting the minted `tokenId` from a `Transfer` event log — was composed against the raw `NonfungiblePositionManager`.
- Before writing any code, a two-part infrastructure gate had to be verified by hand: whether V3 was deployed on testnet at all (yes, at a **different address than mainnet** — using the mainnet address would have silently targeted the wrong contract), and which candidate pool actually had liquidity (WBNB/BUSD V3 was empty across all 4 fee tiers — ticks parked at the extremes, never initialized; WBNB/USDT-official at 0.25% had real, healthy liquidity).
- Real cost, from AGENT_LOG.md: **~40 minutes** — 10 min the two-part infrastructure gate, 10 min sourcing USDT (the official testnet token's `mint()` reverted with "not the owner", requiring a pivot to a V2 swap instead), 15 min script design (tick alignment, token ordering, tokenId extraction), 5 min execution.
- Notably, **all 5 transactions in this build confirmed on the first attempt, with zero decimals or session bugs** — stated directly in AGENT_LOG.md. That's not luck: it's because the decimals lesson from Health Factor and the pool-verification lesson from Grid Trading were already learned and applied by design before this agent was built.

**Manual path — ESTIMATE:** tick math is an unforgiving, *silent* failure mode — a manual user who gets the range wrong doesn't get a revert, they get a position that mints successfully and simply earns zero fees sitting outside the active price range. We have no real case of hitting this specific failure (we avoided it, per above), so we don't claim a number for it; we flag it as the highest-severity *silent* risk in this comparison precisely because it wouldn't show up as an error at all.

**Verdict:** this is the task with the largest manual step count (5 raw contract interactions, tick math with no forgiving error mode) and the clearest evidence that getting it right the first time depended on lessons paid for on the other two agents — not something a first-time manual user gets for free.

---

## Summary

| Task | Real anchor tx (gas) | Manual — measured | Hire — measured | Manual — estimated ongoing cost |
|---|---|---|---|---|
| Grid Trading | [kick-off](https://testnet.bscscan.com/tx/0xa5c689a0a3684935cf6d1446eaad9a3903c8471f152be9cd1b42debd58706e91) (248,100 gas) | **55 min**; 1 inflated-pool bug avoided | **29.4 s** end-to-end | Sub-1% threshold monitoring — not sustainable by a human, unquantified |
| Health Factor | [borrow](https://testnet.bscscan.com/tx/0x3b4317c9eba9d4734785f61051920d766f82593694ace2e6be40badc28b73775) + [repay](https://testnet.bscscan.com/tx/0x557c3171ea77fba6c53ccaafbd73719589c5d147c9977b158201c222363392c1) (646,230 + 284,866 gas) | **70 min**; **real 10¹²× decimals bug hit and caught**; session-permission wall (3 failed attempts) | **26.3 s** end-to-end | Re-deriving the HF formula manually risks repeating the same decimals trap — unquantified |
| V3 Rebalancing | [close](https://testnet.bscscan.com/tx/0x485da2875edf17055307b52f4e18e47cdda5b419ce64453a02787f7fe7e022df) + [reopen](https://testnet.bscscan.com/tx/0x5ae725b19bccdf05f256051493170eea5c00f20f0386f1f4f3187dd1fecebd24) (940,454 gas, 5s apart) | **40 min**; 2-part infra gate; 0 bugs — because prior lessons were applied by design | not separately instrumented; same code path as the two above | Silent failure mode (wrong range ⇒ zero fees, no revert) — highest-severity, unquantified because we avoided it |

Gas is not the differentiator in any of the three tasks — the same contract calls execute on-chain either way, hand-composed or agent-executed. The advantage is in the **research and correctness work done once, by hand, and encoded permanently**: 55 + 70 + 40 = 165 minutes of first-hand, documented manual composition across the three tasks, during which we hit one live decimals bug, one live session-permission wall, and one live inflated-pool trap.

With both columns measured, the comparison is **165 minutes of documented manual work against ~29 seconds per hire** — and of those 29 seconds, only ~0.9 s is chain confirmation. The remaining ~28.5 s is relay orchestration that gets faster as the infrastructure improves, while the manual side's cost is knowledge that has to be re-acquired by whoever tries it next. Hiring collapses the work into a single x402 round trip — not because the underlying DeFi mechanics got simpler, but because someone already paid the cost of getting them right and verified it on-chain.
