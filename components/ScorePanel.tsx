import {
  accuracy,
  brier,
  cbmMax,
  cbmScore,
  overconfidence,
} from "@/lib/scoring";
import type { Response } from "@/lib/types";

function reading(rs: Response[]): string {
  const over = overconfidence(rs);
  const acc = accuracy(rs);
  if (rs.length === 0) return "Nothing scored yet.";
  if (over > 0.15)
    return `You got ${Math.round(acc * 100)}% right but backed your answers as if you would get ${Math.round((acc + over) * 100)}%. The gap, not the wrong answers, is what to work on.`;
  if (over < -0.15)
    return `You got ${Math.round(acc * 100)}% right while betting as if you would get ${Math.round((acc + over) * 100)}%. You are underclaiming what you know.`;
  return `You got ${Math.round(acc * 100)}% right and your certainty tracked that closely. Well calibrated.`;
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
