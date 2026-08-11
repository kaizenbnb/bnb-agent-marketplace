import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import { CATEGORIES, AGENTS } from "@/lib/agents";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-20">
      <span className="mb-3 rounded-full border border-bnb-gold/30 bg-bnb-gold/10 px-3 py-1 text-xs font-medium text-bnb-gold">
        BNB Agent Studio Marketplace — testnet skeleton
      </span>
      <h1 className="text-center text-4xl font-bold tracking-tight text-bnb-text sm:text-5xl">
        Encuentra agentes reales.
        <br />
        Contrátalos en un clic.
      </h1>
      <p className="mt-4 max-w-xl text-center text-bnb-muted">
        {AGENTS.length} agentes vivos en BSC testnet, uno por categoría. Cada tarjeta enlaza a
        su transacción real onchain.
      </p>

      <div className="mt-10 w-full flex justify-center">
        <SearchBar />
      </div>

      <div className="mt-12 grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.slug}
            href={`/category/${cat.slug}`}
            className="flex flex-col rounded-lg border border-bnb-line bg-bnb-card p-4 text-center transition hover:border-bnb-gold"
          >
            <span className="text-sm font-semibold text-bnb-text">{cat.label}</span>
            <span className="mt-1 text-xs text-bnb-muted">{cat.ruleOfThumb}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
