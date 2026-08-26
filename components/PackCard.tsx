import Link from "next/link";
import type { Pack } from "@/lib/types";

const ACCENTS: Record<string, string> = {
  seasons: "from-ember-500/25 to-transparent",
  selection: "from-mint-400/20 to-transparent",
  chance: "from-iris-400/25 to-transparent",
};

export default function PackCard({ pack }: { pack: Pack }) {
  return (
    <Link
      href={`/study/${pack.id}`}
      className="group glass relative flex flex-col overflow-hidden rounded-3xl p-6 transition duration-300 hover:-translate-y-1 hover:border-iris-400/60 sm:p-7"
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b ${
          ACCENTS[pack.id] ?? "from-iris-400/20 to-transparent"
        } opacity-70 blur-2xl transition group-hover:opacity-100`}
      />
      <div className="relative flex flex-1 flex-col">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">
          {pack.items.length} questions
        </p>
        <h2 className="mt-3 text-2xl font-semibold leading-tight text-ink-50 sm:text-[1.7rem]">
          {pack.title}
        </h2>
        <p className="mt-3 flex-1 text-[0.98rem] leading-relaxed text-ink-300">
          {pack.blurb}
        </p>
        <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-iris-300">
          Start probing
          <span
            aria-hidden
            className="transition-transform duration-300 group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
