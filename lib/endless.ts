/**
 * Endless mode: keep asking until the learner has had enough.
 *
 * A fixed pack has to be finished before it can be played, so the learner waits
 * for the whole thing and then answers a length someone else chose. Endless mode
 * inverts that. A short first batch arrives, the learner starts answering, and the
 * next batch is written in the background while they do — so after the first wait
 * there is no wait at all, and the round ends on a target they can raise as they
 * go rather than on the size of the pack.
 *
 * Everything here is pure. The component decides when to fetch; these functions
 * decide whether it should and how much to ask for, which is the part worth
 * pinning in tests rather than in a browser.
 */

import type { Item, Pack, Response } from "./types";

/**
 * Questions in the first batch.
 *
 * Small on purpose: this is the only wait the learner sits through, and three
 * questions is enough to start answering while the fourth is being written. The
 * full-pack path still asks for four to eight in one go.
 */
export const FIRST_BATCH = 3;

/**
 * Questions per background batch.
 *
 * One request fans out into roughly four paid calls per question, so this is the
 * unit of spend as much as the unit of work. Three keeps a batch inside the
 * route's clock with room over, and refills faster than anyone answers.
 */
export const BATCH = 3;

/**
 * Unanswered questions left before the next batch is asked for.
 *
 * Fetching at two rather than at zero is the whole trick: a batch takes tens of
 * seconds, and two questions is more than enough answering time to cover it.
 */
export const LOW_WATER = 2;

/** Where a learner starts, and the step the "keep going" button adds. */
export const DEFAULT_TARGET = 10;
export const TARGET_STEP = 5;

/**
 * The most questions one endless run will ever ask for.
 *
 * A ceiling rather than a preference: the endpoint spends money per question, and
 * an endless mode with no last question is an open tab that bills all night.
 */
export const MAX_TARGET = 40;

/** How many consecutive failed batches before background fetching gives up. */
export const MAX_BATCH_FAILURES = 2;

export function clampTarget(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TARGET;
  return Math.min(MAX_TARGET, Math.max(FIRST_BATCH, Math.round(n)));
}

/** Questions that have arrived but have not been answered yet. */
export function unanswered(pack: Pack | null, responses: Response[]): Item[] {
  if (!pack) return [];
  const answered = new Set(responses.map((r) => r.itemId));
  return pack.items.filter((i) => !answered.has(i.id));
}

/** The target, or the pack's own length when it is not an endless one. */
export function targetOf(pack: Pack | null): number {
  if (!pack) return 0;
  if (!pack.endless) return pack.items.length;
  return clampTarget(pack.target ?? DEFAULT_TARGET);
}

/**
 * Whether the round is over: the target has been met, or nothing more is coming.
 *
 * Not the same as running out of questions. An endless pack that has run dry with
 * a batch in flight is waiting, not finished, and the difference is what stops the
 * reveal screen appearing three questions into a ten-question run.
 */
export function isRoundComplete(
  pack: Pack | null,
  answeredCount: number,
): boolean {
  if (!pack) return false;
  return answeredCount >= targetOf(pack);
}

export interface FetchState {
  /** Whether a batch is being written right now. */
  inFlight: boolean;
  /** Consecutive failures. Background fetching stops after MAX_BATCH_FAILURES. */
  failures: number;
}

/**
 * How many more questions to ask for, or zero to ask for none.
 *
 * Counts what is already on hand and what is already coming, so a batch is never
 * requested for ground a batch in flight will cover, and the run never overshoots
 * the target it is aiming at.
 */
export function nextBatchSize(
  pack: Pack | null,
  responses: Response[],
  state: FetchState,
): number {
  if (!pack?.endless || !pack.material) return 0;
  if (state.inFlight) return 0;
  if (state.failures >= MAX_BATCH_FAILURES) return 0;

  const answered = responses.filter((r) => r.round === "probe").length;
  const waiting = unanswered(pack, responses).length;
  const target = targetOf(pack);

  // Everything the target needs either exists or has been answered.
  const stillWanted = target - answered - waiting;
  if (stillWanted <= 0) return 0;
  // Plenty in hand: the questions already written cover the next few answers.
  if (waiting > LOW_WATER) return 0;

  return Math.min(BATCH, stillWanted);
}

/**
 * The questions already asked, in the form the generator seeds its memory from.
 *
 * Each batch is a separate call with no recollection of the last one, so without
 * this the fourth batch cheerfully asks what the first one did.
 */
export function avoidList(items: Item[]): { topic: string; stem: string }[] {
  return items.map((item) => ({
    topic: item.topic ?? item.conceptId,
    stem: item.stem,
  }));
}

/**
 * Where the next batch's item ids should start counting.
 *
 * Ids are `${packId}-${n}`, and a collision would silently merge two questions
 * into one everywhere a response, a posterior or a score is keyed by item id. The
 * count of items ever added is the only safe basis, so it is taken from the pack
 * rather than from the batch.
 */
export function indexOffsetFor(pack: Pack | null): number {
  return pack?.items.length ?? 0;
}

/** What the learner is told about where they are, in endless mode. */
export function progressLabel(
  pack: Pack | null,
  answeredCount: number,
): string {
  const target = targetOf(pack);
  return `Question ${Math.min(answeredCount + 1, target)} of ${target}`;
}

/** Whether raising the target is still allowed. */
export function canExtend(pack: Pack | null): boolean {
  return Boolean(pack?.endless) && targetOf(pack) < MAX_TARGET;
}

/** The target after one press of "keep going", never past the ceiling. */
export function extendedTarget(pack: Pack | null): number {
  return Math.min(MAX_TARGET, targetOf(pack) + TARGET_STEP);
}
