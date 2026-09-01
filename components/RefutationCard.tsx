"use client";

import SpeakButton from "./SpeakButton";
import { CONF_LABEL } from "@/lib/scoring";
import type { Conf, Refutation } from "@/lib/types";

const BEATS = [
  { key: "believe", label: "What you believe", accent: "text-ember-300" },
  { key: "wrong", label: "Why it's wrong", accent: "text-ink-50" },
  { key: "actual", label: "What's actually happening", accent: "text-mint-300" },
] as const;

/**
 * A refutation, shown only for answers that were wrong *and* held with certainty.
 *
 * When the pack came from the learner's own upload, the card also carries the passage
 * of that material the explanation was written from. It sits under the three beats
 * rather than above them, in the same quiet grey PlainExplanation uses for the same
 * line, because it is there to be checked rather than read.
 */
export default function RefutationCard({
  stem,
  conf,
  refutation,
  loading = false,
}: {
  stem: string;
  conf: Conf;
  refutation: Refutation | null;
  loading?: boolean;
}) {
  const spoken = refutation
    ? `What you believe. ${refutation.believe} Why it's wrong. ${refutation.wrong} What's actually happening. ${refutation.actual}`
    : "";

  return (
    <article className="rise glass overflow-hidden rounded-3xl border-ember-500/40">
      <header className="border-b border-ink-700/70 bg-ember-900/30 px-5 py-4 sm:px-7">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-ember-300">
          You marked this “{CONF_LABEL[conf]}” — and missed it
        </p>
        <h2 className="mt-2 text-base font-semibold leading-snug text-ink-100 sm:text-lg">
          {stem}
        </h2>
      </header>

      <div className="divide-y divide-ink-700/60">
        {BEATS.map(({ key, label, accent }) => (
          <div key={key} className="px-5 py-5 sm:px-7 sm:py-6">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-ink-400">
              {label}
            </p>
            {loading || !refutation ? (
              <div className="mt-3 space-y-2" aria-hidden>
                <div className="h-4 w-full animate-pulse rounded bg-ink-700/70" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-ink-700/50" />
              </div>
            ) : (
              <p
                className={`mt-2.5 text-[1.02rem] leading-relaxed sm:text-lg ${accent}`}
              >
                {refutation[key]}
              </p>
            )}
          </div>
        ))}
      </div>

      {refutation && !loading && refutation.sourceNote ? (
        <div className="border-t border-ink-700/60 bg-ink-950/40 px-5 py-4 sm:px-7">
          <p className="text-sm leading-relaxed text-ink-400">
            {refutation.sourceNote}
          </p>
        </div>
      ) : null}

      {refutation && !loading ? (
        <footer className="px-5 pb-5 sm:px-7 sm:pb-6">
          <SpeakButton text={spoken} label="Read this aloud" />
        </footer>
      ) : null}
    </article>
  );
}
