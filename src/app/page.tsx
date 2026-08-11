import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import { CATEGORIES, AGENTS } from "@/lib/agents";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-20">
      <span className="mb-3 rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-400">
        BNB Agent Studio Marketplace — testnet skeleton
      </span>
      <h1 className="text-center text-4xl font-bold tracking-tight text-neutral-50 sm:text-5xl">
        Encuentra agentes reales.
        <br />
        Contrátalos en un clic.
      </h1>
      <p className="mt-4 max-w-xl text-center text-neutral-400">
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
            className="flex flex-col rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-center transition hover:border-emerald-600 hover:bg-neutral-800"
          >
            <span className="text-sm font-semibold text-neutral-100">{cat.label}</span>
            <span className="mt-1 text-xs text-neutral-500">{cat.ruleOfThumb}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
