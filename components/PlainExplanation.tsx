import type { Item } from "@/lib/types";

/**
 * The non-refutation path. Used for answers that were wrong but only guessed: no
 * belief was held, so there is nothing to refute, so state the answer plainly.
 */
export default function PlainExplanation({ item }: { item: Item }) {
  const correct = item.options.find((o) => o.correct);

  return (
    <article className="fade-in glass rounded-3xl px-5 py-5 sm:px-7 sm:py-6">
      <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-ink-400">
        You marked this “Guessing”, so here is the answer
      </p>
      <h2 className="mt-2 text-base font-semibold leading-snug text-ink-100 sm:text-lg">
        {item.stem}
      </h2>
      <p className="mt-4 text-[1.02rem] leading-relaxed text-mint-300 sm:text-lg">
        {correct?.text}
      </p>
      {item.sourceNote ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-400">
          {item.sourceNote}
        </p>
      ) : null}
    </article>
  );
}
