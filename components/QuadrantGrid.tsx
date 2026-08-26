import { countByQuadrant } from "@/lib/scoring";
import type { Quadrant, Response } from "@/lib/types";

const COPY: Record<
  Quadrant,
  { title: (n: number) => string; label: string; note: string; mark: string }
> = {
  SURE_WRONG: {
    title: (n) =>
      n === 1
        ? "1 thing you were sure about and wrong about"
        : `${n} things you were sure about and wrong about`,
    label: "Sure and wrong",
    note: "These are the beliefs worth repairing. Everything else can wait.",
    mark: "!",
  },
  SURE_RIGHT: {
    title: (n) => `${n} sure and right`,
    label: "Sure and right",
    note: "Solid knowledge.",
    mark: "✓",
  },
  UNSURE_RIGHT: {
    title: (n) => `${n} unsure and right`,
    label: "Unsure and right",
    note: "You knew more than you thought.",
    mark: "~",
  },
  UNSURE_WRONG: {
    title: (n) => `${n} unsure and wrong`,
    label: "Unsure and wrong",
    note: "Honest gaps. A plain explanation is enough.",
    mark: "?",
  },
};

export default function QuadrantGrid({ responses }: { responses: Response[] }) {
  const counts = countByQuadrant(responses);

  return (
    <section aria-labelledby="quadrant-heading">
      <h2
        id="quadrant-heading"
        className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
      >
        Certainty against correctness
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:grid-rows-3">
        <div className="sm:row-span-3">
          <Cell quadrant="SURE_WRONG" n={counts.SURE_WRONG} dominant />
        </div>
        <Cell quadrant="SURE_RIGHT" n={counts.SURE_RIGHT} />
        <Cell quadrant="UNSURE_WRONG" n={counts.UNSURE_WRONG} />
        <div className="sm:col-start-2">
          <Cell quadrant="UNSURE_RIGHT" n={counts.UNSURE_RIGHT} />
        </div>
      </div>
    </section>
  );
}

function Cell({
  quadrant,
  n,
  dominant = false,
}: {
  quadrant: Quadrant;
  n: number;
  dominant?: boolean;
}) {
  const copy = COPY[quadrant];

  if (dominant) {
    return (
      <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border-2 border-[#273447] bg-[#273447] p-6 shadow-[0_14px_30px_rgba(39,52,71,.2)] sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-16 size-52 rounded-full bg-ember-400/30 blur-3xl"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-ember-300/80 bg-ember-400/15 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-ember-300">
            <span aria-hidden>{copy.mark}</span> Confidently wrong
          </span>
          <p className="tnum mt-5 text-6xl font-semibold leading-none text-ember-300 sm:text-7xl">
            {n}
          </p>
          <p className="mt-4 text-lg font-semibold leading-snug text-ink-950 sm:text-xl">
            {copy.title(n)}
          </p>
        </div>
        <p className="relative mt-5 max-w-[28rem] text-sm leading-relaxed text-ink-900">
          {copy.note}
        </p>
      </div>
    );
  }

  return (
    <div className="glass flex items-start gap-4 rounded-2xl px-5 py-4">
      <span
        aria-hidden
        className="tnum mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-ink-600 text-sm font-semibold text-ink-300"
      >
        {copy.mark}
      </span>
      <div>
        <p className="tnum text-2xl font-semibold leading-none text-ink-200">{n}</p>
        <p className="mt-1.5 text-sm font-medium text-ink-200">{copy.label}</p>
        <p className="mt-0.5 text-xs leading-snug text-ink-400">{copy.note}</p>
      </div>
    </div>
  );
}
