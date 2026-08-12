import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agents";
import { build402Body, decodeXPayment, validatePermit2Authorization, settlePermit2Payment } from "@/lib/x402";
import { supplyToVenus, addCollateralToVenus } from "@/lib/venus";
import { fireGridSwap } from "@/lib/pancake";
import { growPositionB } from "@/lib/v3";

/**
 * The x402 "merchant" for hiring an agent. Real three-step handshake:
 *   1. POST without X-PAYMENT -> 402 with payment requirements (accepts[]).
 *   2. POST with X-PAYMENT:
 *      a. VALIDATE: read-only checks (nonce unused, balance/allowance sufficient, deadline OK)
 *      b. WORK: execute the agent's billable action
 *      c. CAPTURE: only if work succeeds, settle the Permit2 payment
 *      Returns BOTH transaction hashes on success. If work fails, payment is never settled.
 *
 * Generalized one agent at a time, each verified end-to-end before the next
 * (see agents/AGENT_LOG.md for the underlying agent lessons).
 */

const WORK_ACTIONS: Record<string, () => Promise<string>> = {
  "yield-venus-comparator": supplyToVenus,
  "health-factor-venus": addCollateralToVenus,
  "grid-pancakeswap-v2": fireGridSwap,
  "rebalancing-pancakeswap-v3": growPositionB,
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const agent = getAgent(agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const doWork = WORK_ACTIONS[agentId];
  if (!doWork) {
    return NextResponse.json(
      { error: "The x402 hire flow isn't wired up for this agent yet." },
      { status: 501 }
    );
  }

  const xPayment = req.headers.get("X-PAYMENT") ?? req.headers.get("PAYMENT-SIGNATURE");

  if (!xPayment) {
    const body = build402Body(
      agent.wallet as `0x${string}`,
      req.nextUrl.toString(),
      `Hire ${agent.name}`
    );
    return NextResponse.json(body, { status: 402 });
  }

  let payload;
  try {
    payload = decodeXPayment(xPayment);
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid X-PAYMENT header" },
      { status: 400 }
    );
  }

  // Step 1: VALIDATE the authorization (read-only, no blockchain writes)
  try {
    await validatePermit2Authorization(payload);
  } catch (err) {
    return NextResponse.json(
      { error: "Authorization validation failed", reason: String(err) },
      { status: 402 }
    );
  }

  // Step 2: WORK — execute the agent's billable action
  let workTxHash: string;
  try {
    workTxHash = await doWork();
  } catch (err) {
    return NextResponse.json(
      { error: "Agent work action failed before payment was captured" },
      { status: 500 }
    );
  }

  // Step 3: CAPTURE — only if work succeeded, settle the payment
  let paymentTxHash: string;
  try {
    paymentTxHash = await settlePermit2Payment(payload, agent.wallet as `0x${string}`);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Work succeeded but payment settlement failed. Work executed; payment may require manual review.",
        work: { txHash: workTxHash },
        details: String(err),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "hired",
    agent: agent.name,
    payment: { txHash: paymentTxHash },
    work: { txHash: workTxHash },
  });
}
