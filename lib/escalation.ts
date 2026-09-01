/**
 * What to do when a refutation does not land.
 *
 * The repair round explains a belief once and the recheck round asks about it
 * again, reworded. Until now a belief that came back wrong the second time just
 * ended up in the summary as a number: the app had said its piece, and the learner
 * who still held the belief got the same explanation or nothing.
 *
 * That is the interesting failure, so it gets a response. A belief that survives
 * the recheck is offered a second explanation in a different style, and the app
 * says which style it switched to and why, because an explanation repeated in the
 * same register is the one thing already known not to work.
 *
 * The ladder is deliberately short. After EXHAUSTED_AFTER attempts the app stops
 * and says the material needs a person, rather than rewording forever: a model that
 * has failed twice on the same misconception is not one attempt away from success,
 * and pretending otherwise wastes the learner's evening. Knowing when to stop is
 * the part most tutoring software gets wrong.
 */

import { baseItemId } from "./topics";
import type { Item, Response } from "./types";

/**
 * How an explanation is framed. Not a difficulty ladder: the second style is not a
 * simpler version of the first, it approaches the same fact from a different side.
 */
export type Style = "direct" | "contrast";

/** In the order they are tried. */
export const STYLES: readonly Style[] = ["direct", "contrast"];

/**
 * Explanations for one belief before the app gives up on explaining it.
 *
 * Two, because the styles are genuinely different approaches and a third would be
 * a rewording. The honest move at that point is to say so.
 */
export const EXHAUSTED_AFTER = STYLES.length;

/** What the learner is told they are looking at. */
export const STYLE_LABEL: Record<Style, string> = {
  direct: "Direct correction",
  contrast: "Side-by-side comparison",
};

/**
 * Appended to the refutation system prompt. Each one changes the shape of the
 * answer, not its length or its content: same three fields, same facts, different
 * route in.
 */
export const STYLE_DIRECTIVE: Record<Style, string> = {
  direct: "",
  contrast:
    "This learner has already read a direct correction of this belief and still holds it, so do not restate it. Instead work by contrast: in `wrong`, name the one case where their belief and the correct model predict different outcomes, and say what is actually observed in that case. In `actual`, walk the same case through the correct model step by step. Use a concrete example with specific quantities rather than a general principle.",
};

/** The style to try next, or null once the app should stop explaining. */
export function styleFor(attempts: number): Style | null {
  if (!Number.isFinite(attempts) || attempts < 0) return STYLES[0]!;
  return STYLES[Math.floor(attempts)] ?? null;
}

export function isExhausted(attempts: number): boolean {
  return styleFor(attempts) === null;
}

/**
 * Why the app changed how it is explaining, said out loud.
 *
 * Stated rather than done silently. A learner who reads a second explanation with
 * no reason given has to guess whether the app noticed the first one failed, and
 * the fact that it noticed is the useful part.
 */
export function switchReason(to: Style): string {
  if (to === "contrast") {
    return "The direct correction did not land, so this one works by comparison instead: the same fact approached from a case where the two beliefs disagree.";
  }
  return "Starting with the plainest statement of the correction.";
}

/** What the app says when it has stopped explaining. Deliberately not encouraging. */
export const HANDOFF_HEADING = "This one needs a person.";

export const HANDOFF_BODY =
  "Two explanations in two different styles have not shifted this belief, so a third wording is unlikely to. That usually means something upstream of this question is missing rather than the question itself being hard. Take the sentences below to whoever teaches you, or to a study group, and ask them to work an example with you.";

/** A belief the recheck round found still in place. */
export interface SurvivingBelief {
  item: Item;
  /** The probe answer that first showed the belief. */
  probe: Response;
  /** The reworded answer that showed it again. */
  recheck: Response;
  /** The misconception the recheck answer points at, when it names one. */
  key: string | null;
  /** True when the same misconception was picked both times. */
  sameBelief: boolean;
}

/**
 * Beliefs that were explained and came back anyway.
 *
 * Keyed off the recheck answer rather than the probe one: what matters is whether
 * the belief is still there now, and the recheck item is the reworded one, so
 * recognising the first phrasing cannot account for it. Variant ids are mapped back
 * to their base item, which is also the item the refutation was written for.
 *
 * Guessed misses are included when the same wrong option came back twice. Once is
 * a guess; the same guess twice, after an explanation, is a belief that the guess
 * label was hiding.
 */
export function survivingBeliefs(
  items: Item[],
  probe: Response[],
  recheck: Response[],
): SurvivingBelief[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const probeById = new Map(probe.map((r) => [baseItemId(r.itemId), r]));
  const out: SurvivingBelief[] = [];

  for (const response of recheck) {
    if (response.correct) continue;
    const baseId = baseItemId(response.itemId);
    const item = byId.get(baseId);
    const first = probeById.get(baseId);
    if (!item || !first || first.correct) continue;

    const chosen = item.options.find((o) => o.id === response.chosenOptionId);
    const sameBelief = first.chosenOptionId === response.chosenOptionId;
    // A guessed miss that came back different both times is noise, not a belief.
    if (first.conf === 1 && !sameBelief) continue;

    out.push({
      item,
      probe: first,
      recheck: response,
      key: chosen?.misconception?.trim() || null,
      sameBelief,
    });
  }

  // Held with certainty first, then the ones the learner repeated exactly.
  return out.sort(
    (a, b) =>
      b.recheck.conf - a.recheck.conf ||
      Number(b.sameBelief) - Number(a.sameBelief),
  );
}

/** One line for the summary, so the count is never just a number. */
export function survivalSentence(count: number): string {
  if (count === 0) return "Every belief that was explained came back corrected.";
  if (count === 1) {
    return "One belief survived the explanation and came back on the reworded question.";
  }
  return `${count} beliefs survived their explanations and came back on the reworded questions.`;
}
