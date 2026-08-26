import PackCard from "@/components/PackCard";
import { PACKS } from "@/lib/packs";

export default function Home() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 pt-14 sm:px-8 sm:pt-20 safe-b"
    >
      <header className="rise">
        <p className="inline-flex items-center gap-2 rounded-full border border-ink-600/70 bg-ink-850/60 px-3 py-1 text-xs font-medium tracking-wide text-ink-300">
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-ember-400"
          />
          Certainty-based marking
        </p>
        <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-ink-50 sm:text-6xl">
          Confidently
          <span className="block bg-gradient-to-r from-ember-300 via-ember-400 to-iris-300 bg-clip-text text-transparent">
            Wrong
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-300 sm:text-lg">
          Answer questions on material you have not studied, and say how sure you
          are. You get no feedback until the end. Then you see the beliefs you were
          certain about and wrong about — and only those get corrected.
        </p>
      </header>

      <section className="mt-10 sm:mt-14" aria-labelledby="packs-heading">
        <h2
          id="packs-heading"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
        >
          Pick a pack
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PACKS.map((pack) => (
            <PackCard key={pack.id} pack={pack} />
          ))}
        </div>
      </section>

      <section className="mt-12 grid gap-3 sm:mt-16 sm:grid-cols-5">
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
