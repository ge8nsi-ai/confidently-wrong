import {
  beliefStates,
  reading,
  SOUND,
  topBelief,
  type BeliefState,
  type Hypothesis,
} from "@/lib/belief";
import type { Item, Response } from "@/lib/types";

/**
 * What the app now thinks the learner believes, in the learner's language.
 *
 * The posterior underneath is unchanged; what it says about itself is not. It used
 * to lead with entropy in bits and label the correct hypothesis "Has this right",
 * which reads as a fragment of someone else's notes. Every row now says what it
 * means in a sentence, and the ordering puts a probable misconception above a
 * concept that looks sound, because that is the row worth reading.
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
    .sort(byWorthReading);

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
        Read from your certainty, not just your answers: picking a wrong answer while
        certain is strong evidence you hold that idea, while picking the same answer
        as a guess is barely evidence at all. One question rarely settles anything,
        which is why a single answer leaves several ideas still in play.
      </p>
    </section>
  );
}

/**
 * A likely misconception first, then anything still open, then what looks sound.
 *
 * Sorting by entropy put the least-informed card at the top: most uncertain is also
 * least worth reading.
 */
function byWorthReading(a: BeliefState, b: BeliefState): number {
  const rank = (s: BeliefState) => {
    const top = topBelief(s);
    if (top && top.key !== SOUND && reading(s) !== "open") return 0;
    if (reading(s) === "open") return 1;
    return 2;
  };
  const difference = rank(a) - rank(b);
  if (difference !== 0) return difference;
  return (topBelief(b)?.probability ?? 0) - (topBelief(a)?.probability ?? 0);
}

/** The sentence a card leads with, which is the only line most people will read. */
function verdict(state: BeliefState, top: Hypothesis): string {
  const sound = top.key === SOUND;
  switch (reading(state)) {
    case "clear":
      return sound ? "This one looks sound." : "You seem to believe:";
    case "leaning":
      return sound
        ? "This one probably looks sound, on one answer."
        : "You may believe:";
    default:
      return "Not enough answers here to say yet. The likeliest reading so far:";
  }
}

function BeliefRow({ state }: { state: BeliefState }) {
  const top = topBelief(state);
  if (!top) return null;
  const sound = top.key === SOUND;
  const shown = state.hypotheses.filter((h) => h.probability >= 0.05).slice(0, 4);
  const hidden = state.hypotheses.length - shown.length;

  return (
    <li className="glass rounded-2xl px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-ink-50">{state.topic}</p>
        <p className="tnum text-xs text-ink-400">
          from {state.observations} answer{state.observations === 1 ? "" : "s"}
        </p>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink-200">
        {verdict(state, top)}{" "}
        {!sound && (
          <span className="font-medium text-ember-300">
            &ldquo;{top.label}&rdquo;
          </span>
        )}
      </p>

      <div className="mt-3 grid gap-1.5">
        {shown.map((h) => (
          <div key={h.key} className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-ink-400">
              {h.key === SOUND ? "You understand it" : h.label}
            </span>
            <div
              className="mt-1 h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-ink-600/40 sm:w-32"
              role="img"
              aria-label={`${h.key === SOUND ? "You understand it" : h.label}: ${Math.round(h.probability * 100)} percent`}
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

      {hidden > 0 && (
        <p className="mt-2 text-xs text-ink-400">
          {hidden} other idea{hidden === 1 ? "" : "s"} below 5%, not ruled out.
        </p>
      )}
    </li>
  );
}
