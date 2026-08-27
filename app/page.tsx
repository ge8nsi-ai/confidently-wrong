import Link from "next/link";
import PackCard from "@/components/PackCard";
import { PACKS } from "@/lib/packs";

export default function Home() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 pb-8 pt-8 sm:px-10 sm:pt-12 safe-b"
    >
      <header className="rise">
        <div className="flex items-center gap-3 pr-14 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-300">
          <span className="grid size-9 place-items-center rounded-xl bg-ink-50 text-lg text-ink-950 shadow-sm" aria-hidden>
            ✦
          </span>
          <span>Field notes · 01</span>
          <span className="h-px w-10 bg-ink-600" aria-hidden />
          <span>Certainty study</span>
        </div>
        <div className="mt-7 max-w-3xl">
          <h1 className="text-[2.65rem] font-semibold leading-[1.02] tracking-[-0.035em] text-ink-50 sm:text-6xl">
            Find the beliefs that need changing.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-300 sm:text-lg">
            A short pretest for the things you think you know. Answer first, name
            your certainty, then repair only the misses you stood behind.
          </p>
        </div>
      </header>

      <section className="mt-10 rounded-[2.25rem] bg-ink-950/35 p-3 sm:mt-14 sm:p-5" aria-labelledby="packs-heading">
        <h2
          id="packs-heading"
          className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-300"
        >
          Pick a pack
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PACKS.map((pack) => (
            <PackCard key={pack.id} pack={pack} />
          ))}
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2" aria-labelledby="own-heading">
        <h2 id="own-heading" className="sr-only">
          Your own study
        </h2>
        <Link
          href="/explain"
          className="glass group flex items-start gap-4 rounded-2xl px-5 py-4 transition hover:-translate-y-0.5 sm:col-span-2"
        >
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink-50 text-lg text-ink-950"
          >
            🎙
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink-50">
              Explain a topic out loud
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-ink-400">
              Say what you think you know — you get told what was wrong, then quizzed
              on exactly that, with your own claims as the tempting answers
            </span>
          </span>
        </Link>
        <Link
          href="/packs/new"
          className="glass group flex items-start gap-4 rounded-2xl px-5 py-4 transition hover:-translate-y-0.5"
        >
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink-50 text-lg text-ink-950"
          >
            +
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink-50">
              Build a pack from your material
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-ink-400">
              Attach a PDF or paste notes — questions are written from what you supply
            </span>
          </span>
        </Link>
        <Link
          href="/dashboard"
          className="glass group flex items-start gap-4 rounded-2xl px-5 py-4 transition hover:-translate-y-0.5"
        >
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-ink-600 text-sm font-semibold text-ink-300"
          >
            ▦
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink-50">
              Dashboard
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-ink-400">
              The topics you keep missing, your calibration over time, past sessions
            </span>
          </span>
        </Link>
      </section>

      <section className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-5">
        {[
          ["Pick", "Choose a pack"],
          ["Probe", "Answer plus certainty, no feedback"],
          ["Reveal", "Quadrants, calibration, score"],
          ["Repair", "Refutations, only where you were sure"],
          ["Recheck", "Reworded variants of the misses"],
        ].map(([name, detail], i) => (
          <div
            key={name}
            className="glass rounded-2xl px-4 py-3.5"
          >
            <p className="tnum text-xs font-semibold text-iris-300">
              {String(i + 1).padStart(2, "0")}
            </p>
            <p className="mt-1 text-sm font-semibold text-ink-50">{name}</p>
            <p className="mt-0.5 text-xs leading-snug text-ink-400">{detail}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto pt-14 text-xs leading-relaxed text-ink-400">
        Nothing is stored on a server. Your answers live in this browser only.
      </footer>
    </main>
  );
}
