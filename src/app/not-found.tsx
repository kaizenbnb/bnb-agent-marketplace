import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-bnb-gold">404</p>
      <h1 className="mt-3 text-3xl font-bold text-bnb-text">Nothing here</h1>
      <p className="mt-3 max-w-md text-sm text-bnb-muted">
        This agent or category doesn&apos;t exist. KaizenScope currently lists 4 verified
        agents across 4 categories.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-md bg-bnb-gold px-6 py-3 text-sm font-semibold text-bnb-carbon hover:bg-bnb-gold/90"
      >
        Back to all agents
      </Link>
    </main>
  );
}
