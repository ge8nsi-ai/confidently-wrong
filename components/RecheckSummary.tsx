"use client";

import CalibrationChart from "./CalibrationChart";
import {
  accuracy,
  cbmScore,
  countByQuadrant,
  overconfidence,
} from "@/lib/scoring";
import type { Response } from "@/lib/types";

export default function RecheckSummary({
  before,
  after,
  onRestart,
}: {
  before: Response[];
  after: Response[];
  onRestart: () => void;
}) {
  const sureWrongBefore = countByQuadrant(before).SURE_WRONG;
  const sureWrongAfter = countByQuadrant(after).SURE_WRONG;
  const deltaOver = overconfidence(after) - overconfidence(before);

  return (
    <div className="grid gap-8">
      <header className="rise">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">
          Recheck complete
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight text-ink-50 sm:text-4xl">
          {after.length === 0
            ? "Nothing to recheck — you missed nothing."
            : `${accuracy(after) === 1 ? "All" : `${Math.round(accuracy(after) * 100)}% of`} the reworded questions came back right.`}
        </h1>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Delta
          label="Confidently wrong"
          before={sureWrongBefore}
          after={sureWrongAfter}
          lowerIsBetter
        />
        <Delta
          label="CBM score"
          before={cbmScore(before)}
          after={cbmScore(after)}
        />
        <div className="glass rounded-2xl px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-400">
            Overconfidence shift
          </p>
          <p className="tnum mt-2 text-3xl font-semibold leading-none text-ink-50">
            {deltaOver > 0 ? "+" : ""}
            {Math.round(deltaOver * 100)}
          </p>
          <p className="mt-1.5 text-xs leading-snug text-ink-400">
            {deltaOver < 0
              ? "Your certainty moved closer to your accuracy."
              : "Your certainty is still running ahead of your accuracy."}
          </p>
        </div>
      </section>

      <CalibrationChart responses={before} after={after} showSentence={false} />

      <p className="text-sm leading-relaxed text-ink-300">
        Only the questions you missed came back, reworded, so recognising the
        original phrasing could not help you. The solid line is the first pass; the
        dashed line is the recheck.
      </p>

      <button
        type="button"
        onClick={onRestart}
        className="w-full rounded-2xl bg-ink-50 px-6 py-4 text-base font-semibold text-ink-950 transition hover:bg-[#3e4d62]"
      >
        Try another pack
      </button>
    </div>
  );
}

function Delta({
  label,
  before,
  after,
  lowerIsBetter = false,
}: {
  label: string;
  before: number;
  after: number;
  lowerIsBetter?: boolean;
}) {
  const improved = lowerIsBetter ? after < before : after > before;
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-400">
        {label}
      </p>
      <p className="tnum mt-2 flex items-baseline gap-2 text-3xl font-semibold leading-none text-ink-50">
        <span className="text-ink-400">{before}</span>
        <span aria-hidden className="text-base text-ink-400">
          →
        </span>
        <span className={improved ? "text-mint-300" : "text-ink-50"}>{after}</span>
      </p>
      <p className="mt-1.5 text-xs leading-snug text-ink-400">
        {improved ? "Improved" : "No improvement yet"}
      </p>
    </div>
  );
}
