"use client";

import { useState } from "react";

export default function HireButton({ agentName }: { agentName: string }) {
  const [clicked, setClicked] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setClicked(true)}
        className="rounded-md bg-bnb-gold px-6 py-3 text-sm font-semibold text-bnb-carbon hover:bg-bnb-gold/90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={clicked}
      >
        {clicked ? "Contratación pendiente de x402" : `Hire ${agentName}`}
      </button>
      {clicked && (
        <p className="mt-3 text-xs text-bnb-muted">
          Placeholder — el flujo de pago x402 (b402 / Altana session) todavía no está cableado.
          Este botón queda listo para conectarlo en la siguiente fase.
        </p>
      )}
    </div>
  );
}
