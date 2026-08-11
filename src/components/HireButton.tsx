"use client";

import { useState } from "react";

export default function HireButton({ agentName }: { agentName: string }) {
  const [clicked, setClicked] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setClicked(true)}
        className="rounded-md bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={clicked}
      >
        {clicked ? "Contratación pendiente de x402" : `Hire ${agentName}`}
      </button>
      {clicked && (
        <p className="mt-3 text-xs text-neutral-500">
          Placeholder — el flujo de pago x402 (b402 / Altana session) todavía no está cableado.
          Este botón queda listo para conectarlo en la siguiente fase.
        </p>
      )}
    </div>
  );
}
