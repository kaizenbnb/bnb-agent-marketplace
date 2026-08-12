import { EXPLORER_ADDRESS_BASE, GITHUB_REPO_URL } from "@/lib/agents";

const WALLET = "0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb";

export default function Footer() {
  return (
    <footer className="border-t border-bnb-line">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 py-8 text-xs text-bnb-muted sm:flex-row sm:justify-between">
        <span>KaizenScope · Built on BNB Chain</span>
        <div className="flex items-center gap-4">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-bnb-gold"
          >
            GitHub
          </a>
          <a
            href={`${EXPLORER_ADDRESS_BASE}${WALLET}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-bnb-gold"
          >
            Agent wallet on BscScan
          </a>
        </div>
      </div>
    </footer>
  );
}
