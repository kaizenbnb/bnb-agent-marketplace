import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-bnb-line bg-bnb-carbon/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-sm font-bold tracking-tight text-bnb-gold">
          KaizenScope
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-bnb-muted">Built on BNB Chain</span>
          <ConnectButton showBalance={false} />
        </div>
      </div>
    </header>
  );
}
