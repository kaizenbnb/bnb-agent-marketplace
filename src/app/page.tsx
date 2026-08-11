import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import { CATEGORIES, AGENTS } from "@/lib/agents";

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-20">
      <div className="hero-glow" />

      <span className="relative mb-3 rounded-full border border-bnb-gold/30 bg-bnb-gold/10 px-3 py-1 text-xs font-medium text-bnb-gold">
        KaizenScope — Live on BSC Testnet
      </span>
      <h1 className="relative text-center text-4xl font-bold tracking-tight text-bnb-text sm:text-5xl">
        Find real agents.
        <br />
        Hire them in one click.
      </h1>
      <p className="relative mt-4 max-w-xl text-center text-bnb-muted">
        {AGENTS.length} live agents on BSC testnet, one per category. Every card links to its
        real onchain transaction.
      </p>

      <div className="relative mt-10 w-full flex justify-center">
        <SearchBar />
      </div>

      <div className="relative mt-12 grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
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
