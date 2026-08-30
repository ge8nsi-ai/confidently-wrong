import {
  accuracy,
  brier,
  cbmMax,
  cbmScore,
  overconfidence,
} from "@/lib/scoring";
import type { Response } from "@/lib/types";

/**
 * One sentence naming the gap between certainty and accuracy.
 *
 * "Backed your answers as if you would get 78%" was a betting metaphor doing the
 * work a plain sentence should do: the two numbers are how often the learner was
 * right and how often their own certainty said they would be, so that is what it
 * now says.
 */
function reading(rs: Response[]): string {
  const over = overconfidence(rs);
  const acc = accuracy(rs);
  if (rs.length === 0) return "Nothing scored yet.";
  const right = Math.round(acc * 100);
  const claimed = Math.round((acc + over) * 100);
  const gap = Math.abs(claimed - right);
  if (over > 0.15)
    return `You were right ${right}% of the time. Your certainty said ${claimed}%. Closing that ${gap}-point gap matters more than the wrong answers themselves.`;
  if (over < -0.15)
    return `You were right ${right}% of the time, but your certainty said only ${claimed}%. You know more than you are giving yourself credit for.`;
  return `You were right ${right}% of the time, and your certainty said about the same. That is well calibrated.`;
}

export default function ScorePanel({ responses }: { responses: Response[] }) {
  const score = cbmScore(responses);
  const max = cbmMax(responses);

  return (
    <section aria-labelledby="score-heading">
      <h2
        id="score-heading"
        className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
      >
        Certainty-based marking score
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat
          label="CBM score"
          value={`${score > 0 ? "+" : ""}${score}`}
          detail={`out of a possible ${max}`}
          emphasis
        />
        <Stat
          label="Brier score"
          value={brier(responses).toFixed(2)}
          detail="lower is better calibrated"
        />
        <Stat
          label="Overconfidence"
          value={`${overconfidence(responses) > 0 ? "+" : ""}${Math.round(
            overconfidence(responses) * 100,
          )}`}
          detail="points of certainty above accuracy"
        />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-ink-300 sm:text-base">
        {reading(responses)}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ink-400">
        Scoring follows Gardner-Medwin: a correct answer is worth 1, 2 or 3 by
        certainty, and a wrong answer costs 0, −2 or −6. Guessing honestly is never
        punished; claiming certainty and missing is.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`glass rounded-2xl px-5 py-4 ${
        emphasis ? "border-iris-400/50" : ""
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-ink-400">
        {label}
      </p>
      <p
        className={`tnum mt-2 text-3xl font-semibold leading-none sm:text-4xl ${
          emphasis ? "text-iris-300" : "text-ink-50"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs leading-snug text-ink-400">{detail}</p>
    </div>
  );
}
