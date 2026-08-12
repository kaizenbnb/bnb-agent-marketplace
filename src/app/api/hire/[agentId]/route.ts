import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agents";
import { build402Body, decodeXPayment, settlePermit2Payment } from "@/lib/x402";
import { supplyToVenus, addCollateralToVenus } from "@/lib/venus";

/**
 * The x402 "merchant" for hiring an agent. Real two-step handshake:
 *   1. POST without X-PAYMENT -> 402 with payment requirements (accepts[]).
 *   2. POST again with a valid X-PAYMENT -> settles the Permit2 authorization
 *      on-chain, then executes the agent's real billable action, and returns
 *      BOTH transaction hashes. A hire that only charges isn't a hire.
 *
 * Generalized one agent at a time, each verified end-to-end before the next
 * (see AGENT_LOG.md in BNB-Hackaton for the underlying agent lessons).
 */

const WORK_ACTIONS: Record<string, () => Promise<string>> = {
  "yield-venus-comparator": supplyToVenus,
  "health-factor-venus": addCollateralToVenus,
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

  let paymentTxHash: string;
  try {
    const payload = decodeXPayment(xPayment);
    paymentTxHash = await settlePermit2Payment(payload, agent.wallet as `0x${string}`);
  } catch (err) {
    return NextResponse.json(
      { error: "Payment settlement failed", details: String(err) },
      { status: 402 }
    );
  }

  try {
    const workTxHash = await doWork();
    return NextResponse.json({
      status: "hired",
      agent: agent.name,
      payment: { txHash: paymentTxHash },
      work: { txHash: workTxHash },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Payment settled but the agent's work action failed.",
        payment: { txHash: paymentTxHash },
        details: String(err),
      },
      { status: 500 }
    );
  }
}
