import Link from "next/link";
import type { PlanKind, PlanStep } from "@/lib/plan";

/**
 * What the record says to do next, in order.
 *
 * Every step carries the numbers that produced it, in the step itself rather than a
 * footnote, because a plan a learner cannot audit is just an instruction.
 */

/** Why this step exists, in two words, so the ordering is visible. */
const KIND_LABEL: Record<PlanKind, string> = {
  start: "First run",
  repair: "Carried belief",
  topic: "Missed while certain",
  calibration: "Certainty gap",
  spaced: "Going quiet",
};

const KIND_TONE: Record<PlanKind, string> = {
  start: "border-ink-600 text-ink-300",
  repair: "border-ember-500/70 text-ember-300",
  topic: "border-ember-500/70 text-ember-300",
  calibration: "border-amber-500/60 text-amber-200",
  spaced: "border-ink-600 text-ink-300",
};

export default function StudyPlan({
  steps,
  summary,
}: {
  steps: PlanStep[];
  summary: string;
}) {
  return (
    <section aria-labelledby="plan-heading" className="glass rounded-3xl p-5 sm:p-7">
      <h2
        id="plan-heading"
        className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
      >
        Study next
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-300">{summary}</p>

      {steps.length === 0 ? null : (
        <ol className="mt-5 grid gap-3">
          {steps.map((step, i) => (
            <li
              key={`${step.kind}-${step.conceptId ?? i}`}
              className="rounded-2xl border border-ink-700 bg-ink-950/60 px-4 py-4"
            >
              <div className="flex items-baseline gap-3">
                <span className="tnum text-xs font-bold text-ink-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-ink-50">
                    {step.title}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
                    {step.why}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] ${KIND_TONE[step.kind]}`}
                >
                  {KIND_LABEL[step.kind]}
                </span>
              </div>
              <Link
                href={step.href}
                className="mt-3 inline-flex rounded-full bg-ink-50 px-3.5 py-1.5 text-xs font-semibold text-ink-950 transition hover:-translate-y-0.5"
              >
                {step.action}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
