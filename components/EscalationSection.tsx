"use client";

import { useMemo, useState } from "react";
import RefutationCard from "./RefutationCard";
import {
  HANDOFF_BODY,
  HANDOFF_HEADING,
  STYLES,
  STYLE_LABEL,
  styleFor,
  survivalSentence,
  survivingBeliefs,
  switchReason,
  type Style,
  type SurvivingBelief,
} from "@/lib/escalation";
import { attemptsMade, refutationKey, useStudy } from "@/lib/store";
import type { Item, Refutation, Response } from "@/lib/types";

/**
 * The beliefs that were explained and came back anyway.
 *
 * This is the part of the flow the app used to have no answer for. A belief that
 * survived its refutation showed up in the summary as a number and nothing more,
 * even though it is the most informative thing that happens in a session: the
 * explanation was read, understood well enough to answer with, and rejected.
 *
 * So each survivor is offered one more explanation, in a style the learner has not
 * seen, with the switch stated rather than made quietly. After that the app stops.
 * It does not reword a third time and it does not encourage.
 */
export default function EscalationSection({
  items,
  probe,
  recheck,
}: {
  items: Item[];
  probe: Response[];
  recheck: Response[];
}) {
  const survivors = useMemo(
    () => survivingBeliefs(items, probe, recheck),
    [items, probe, recheck],
  );
  if (survivors.length === 0) return null;

  return (
    <section aria-labelledby="survived-heading" className="grid gap-4">
      <div>
        <h2
          id="survived-heading"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
        >
          Explained once, still there
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-300">
          {survivalSentence(survivors.length)} Reading the same correction again is
          the one thing already known not to work, so a second attempt comes at it
          from a different side.
        </p>
      </div>
      <ul className="grid gap-4">
        {survivors.map((survivor) => (
          <SurvivorRow key={survivor.item.id} survivor={survivor} />
        ))}
      </ul>
    </section>
  );
}

function SurvivorRow({ survivor }: { survivor: SurvivingBelief }) {
  const refutations = useStudy((s) => s.refutations);
  const setRefutation = useStudy((s) => s.setRefutation);
  const [loading, setLoading] = useState(false);
  const [handedOff, setHandedOff] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const { item, key } = survivor;
  const chosenOptionId = survivor.recheck.chosenOptionId;
  const attempts = attemptsMade(refutations, item.id, chosenOptionId);
  const next = styleFor(attempts);
  // The escalation already on screen, so a reload does not lose it.
  const shownStyle = lastEscalated(refutations, item.id, chosenOptionId);
  const shown = shownStyle
    ? refutations[refutationKey(item.id, chosenOptionId, shownStyle)]
    : undefined;
  const stop = unavailable || next === null;

  async function explainAgain(style: Style) {
    setLoading(true);
    const chosen = item.options.find((o) => o.id === chosenOptionId);
    const correct = item.options.find((o) => o.correct);
    try {
      const res = await fetch("/api/refute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          chosenOptionId,
          stem: item.stem,
          chosenOptionText: chosen?.text ?? "",
          // A pack that never named the belief still has the option that states it.
          misconception: key ?? chosen?.text ?? "",
          correctOptionText: correct?.text ?? "",
          fallbackRefutation: item.fallbackRefutation,
          style,
        }),
      });
      const data = (await res.json()) as { refutation?: Refutation | null };
      if (data.refutation) {
        setRefutation(refutationKey(item.id, chosenOptionId, style), data.refutation);
      } else {
        // No second explanation was available, which is the hand-off, not a retry.
        setUnavailable(true);
      }
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="glass grid gap-4 rounded-2xl px-5 py-5">
      <div>
        <p className="text-sm font-semibold leading-snug text-ink-100">{item.stem}</p>
        <p className="mt-2 text-sm leading-relaxed text-ember-300">
          {key ? `Still reading as: ${key}` : "The same wrong answer came back."}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          {survivor.sameBelief
            ? "Same option both times, before and after the explanation."
            : "A different wrong option this time, so this is a second belief rather than the same one."}
        </p>
      </div>

      {shownStyle && shown ? (
        <div className="grid gap-3">
          <p className="text-xs leading-relaxed text-ink-300">
            <span className="font-semibold text-ink-100">
              {STYLE_LABEL[shownStyle]}.
            </span>{" "}
            {switchReason(shownStyle)}
          </p>
          <RefutationCard
            stem={item.stem}
            conf={survivor.recheck.conf}
            refutation={shown}
          />
        </div>
      ) : null}

      {handedOff || (stop && shown) ? null : (
        <button
          type="button"
          disabled={loading}
          onClick={() => (stop || !next ? setHandedOff(true) : explainAgain(next))}
          className="justify-self-start rounded-2xl border border-ink-600/70 px-5 py-3 text-sm font-semibold text-ink-200 transition hover:border-ink-400 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-ink-400"
        >
          {loading
            ? "Writing a different explanation…"
            : stop
              ? "Still not landing"
              : attempts === 0
                ? "Explain this one"
                : "Explain this a different way"}
        </button>
      )}

      {handedOff || (stop && shown) ? (
        <Handoff item={item} unavailable={unavailable} />
      ) : null}
    </li>
  );
}

/** The most recent style stored for this answer that was not the first attempt. */
function lastEscalated(
  refutations: Record<string, Refutation>,
  itemId: string,
  chosenOptionId: string,
): Style | null {
  for (const style of [...STYLES].reverse()) {
    if (style === "direct") continue;
    if (refutations[refutationKey(itemId, chosenOptionId, style)]) return style;
  }
  return null;
}

/**
 * Where the app stops.
 *
 * It states what it tried, says a person is the next step, and hands over the two
 * sentences worth taking to them. No third rewording and no encouragement: a model
 * that has failed twice on one misconception is not one attempt from success, and
 * saying otherwise would waste the learner's evening.
 */
function Handoff({ item, unavailable }: { item: Item; unavailable: boolean }) {
  const correct = item.options.find((o) => o.correct);
  return (
    <div className="grid gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 px-5 py-4">
      <p className="text-sm font-semibold text-amber-200">{HANDOFF_HEADING}</p>
      <p className="text-sm leading-relaxed text-ink-300">
        {unavailable
          ? "A second explanation in a different style could not be produced, so there is nothing to gain from trying again here. "
          : ""}
        {HANDOFF_BODY}
      </p>
      <div className="grid gap-1.5 rounded-xl bg-ink-900/50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
          Take this with you
        </p>
        <p className="text-sm leading-relaxed text-ink-200">{item.stem}</p>
        <p className="text-sm leading-relaxed text-mint-300">
          The correct answer is: {correct?.text ?? "not recorded for this question."}
        </p>
      </div>
    </div>
  );
}
