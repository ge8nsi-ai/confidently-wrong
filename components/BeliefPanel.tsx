import { beliefStates, SOUND, topBelief, type BeliefState } from "@/lib/belief";
import type { Item, Response } from "@/lib/types";

/**
 * What the app now thinks the learner believes, and how sure it is.
 *
 * Only concepts that were actually asked about appear, and the most uncertain ones
 * come first — an unresolved belief is the useful thing to look at, not a settled one.
 */
export default function BeliefPanel({
  items,
  responses,
}: {
  items: Item[];
  responses: Response[];
}) {
  const states = beliefStates(items, responses)
    .filter((s) => s.observations > 0)
    .sort((a, b) => b.entropy - a.entropy);

  if (states.length === 0) return null;

  return (
    <section aria-labelledby="belief-heading">
      <h2
        id="belief-heading"
        className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
      >
        What the app now thinks you believe
      </h2>

      <ul className="mt-4 grid gap-3">
        {states.map((state) => (
          <BeliefRow key={state.conceptId} state={state} />
        ))}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">
        Inferred from your certainty, not just your answers: picking a wrong answer
        while certain is strong evidence you hold that belief, while picking it as a
        guess is barely evidence at all. Bits left is how much the app still does not
        know — zero would mean one belief explains everything you did.
      </p>
    </section>
  );
}

function BeliefRow({ state }: { state: BeliefState }) {
  const top = topBelief(state);
  if (!top) return null;
  const sound = top.key === SOUND;

  return (
    <li className="glass rounded-2xl px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-ink-50">{state.topic}</p>
        <p className="tnum text-xs text-ink-400">
          {state.entropy.toFixed(2)} bits left · {state.observations} answer
          {state.observations === 1 ? "" : "s"}
        </p>
      </div>

      <p
        className={`mt-2 text-sm leading-relaxed ${
          sound ? "text-ink-200" : "text-ember-300"
        }`}
      >
        {sound ? "You appear to have this right." : top.label}
      </p>

      <div className="mt-3 grid gap-1.5">
        {state.hypotheses.map((h) => (
          <div key={h.key} className="flex items-center gap-3">
            <span
              className="min-w-0 flex-1 truncate text-xs text-ink-400"
              title={h.label}
            >
              {h.label}
            </span>
            <div
              className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-ink-600/40 sm:w-32"
              role="img"
              aria-label={`${h.label}: ${Math.round(h.probability * 100)} percent`}
            >
              <div
                className={`h-full rounded-full ${
                  h.key === SOUND ? "bg-iris-400" : "bg-ember-500"
                }`}
                style={{ width: `${Math.round(h.probability * 100)}%` }}
              />
            </div>
            <span className="tnum w-9 shrink-0 text-right text-xs text-ink-400">
              {Math.round(h.probability * 100)}%
            </span>
          </div>
        ))}
      </div>
    </li>
  );
}
