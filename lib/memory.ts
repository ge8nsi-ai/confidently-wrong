/**
 * What the learner believed last time, carried into this session.
 *
 * The posterior in lib/belief.ts starts flat every time. That is the honest prior
 * for a stranger and the wrong one for someone who sat here last Tuesday holding a
 * named misconception with certainty: the app knew what they believed, threw it
 * away on reload, and opened the next run by asking the question it could already
 * predict the answer to.
 *
 * So each session leaves a note per concept, and the next one starts from those
 * notes. Three things keep a memory from becoming a self-fulfilling prophecy:
 *
 *   - it decays, halving every MEMORY_HALF_LIFE_DAYS, so a belief from March is a
 *     hint and a belief from yesterday is evidence;
 *   - it saturates, never claiming more than MAX_PRIOR_MASS of the distribution, so
 *     this session's answers always outweigh every earlier session put together;
 *   - it never reads the session it is priming, or a run would prime itself and
 *     count its own conclusions twice.
 *
 * Nothing here calls a model and nothing leaves the browser: the notes ride along
 * on the SessionRecord that localStorage already holds.
 */

import { SOUND, beliefStates } from "./belief";
import { quadrant } from "./scoring";
import { baseItemId } from "./topics";
import type { BeliefNote, Item, Response, SessionRecord } from "./types";

/** Days for a remembered belief to count half as much. */
export const MEMORY_HALF_LIFE_DAYS = 30;

/**
 * The most of the prior that memory may ever claim.
 *
 * Below 1 on purpose. At 1 a learner who has changed their mind would have to
 * answer several questions before the model let go of a belief they no longer
 * hold, and the point of the probe round is that it can be surprised.
 */
export const MAX_PRIOR_MASS = 0.6;

/**
 * How settled a posterior has to be to leave a note.
 *
 * The same floor `reading()` in lib/belief.ts uses to stop calling a concept "open",
 * and deliberately the same number: a session should write down exactly what it
 * would have been willing to tell the learner. One wrong answer flagged as a guess
 * leaves its leader at 0.45, which is barely off a flat third; storing that would
 * carry noise forward and dress it as a finding. Two guesses pointing the same way
 * do cross the line, which is correct, because repetition is evidence even when
 * neither answer felt like one.
 */
export const MIN_NOTE_MASS = 0.5;

/** Mass a sure-and-wrong answer contributes when no note recorded which belief. */
const COARSE_NOTE_MASS = 0.5;

/** Weight below which a remembered belief is not worth saying out loud. */
const MIN_RECALL_TO_MENTION = 0.25;

const DAY_MS = 86_400_000;

/** Three decimals is plenty for a prior and keeps localStorage small. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The reading to store when a session ends, one note per concept it settled.
 *
 * Notes are kept for sound concepts too. Knowing the learner had something right is
 * as useful to the next round's ordering as knowing they had it wrong: both make
 * the question predictable, and the round opens on what is not.
 */
export function beliefNotes(items: Item[], responses: Response[]): BeliefNote[] {
  const notes: BeliefNote[] = [];
  for (const state of beliefStates(items, responses)) {
    if (state.observations === 0) continue;
    const top = state.hypotheses[0];
    if (!top || top.probability < MIN_NOTE_MASS) continue;
    notes.push({
      conceptId: state.conceptId,
      key: top.key,
      p: round3(top.probability),
    });
  }
  return notes;
}

interface KeyRecall {
  weight: number;
  lastAt: number;
  sessions: number;
}

export interface Recall {
  conceptId: string;
  /** Decayed weight per remembered belief, keyed as lib/belief.ts keys them. */
  byKey: Map<string, KeyRecall>;
  /**
   * Weight for "a misconception was held here, which one unrecorded".
   *
   * Sessions stored before notes existed know only that an answer was wrong and
   * certain. That is real evidence against SOUND and no evidence at all about which
   * misconception, so it is kept apart and spread evenly when the prior is built.
   */
  unspecified: number;
  lastAt: number;
  sessions: number;
}

/** How much a note from `at` still counts at `now`. */
export function decay(at: number, now: number): number {
  const days = (now - at) / DAY_MS;
  if (!Number.isFinite(days) || days <= 0) return 1;
  return 0.5 ** (days / MEMORY_HALF_LIFE_DAYS);
}

/**
 * Everything history has to say about each concept, decayed to now.
 *
 * `exclude` is the session being played. Leaving it in would feed a run its own
 * conclusions back as a prior, which reads as certainty and is really an echo.
 */
export function recall(
  sessions: SessionRecord[],
  opts: { now?: number; exclude?: string | null } = {},
): Map<string, Recall> {
  const now = opts.now ?? Date.now();
  const out = new Map<string, Recall>();

  const at = (conceptId: string): Recall => {
    let found = out.get(conceptId);
    if (!found) {
      found = {
        conceptId,
        byKey: new Map(),
        unspecified: 0,
        lastAt: 0,
        sessions: 0,
      };
      out.set(conceptId, found);
    }
    return found;
  };

  for (const session of sessions) {
    if (opts.exclude && session.id === opts.exclude) continue;
    const weight = decay(session.updatedAt, now);
    const seen = new Set<string>();

    for (const note of session.beliefs ?? []) {
      const entry = at(note.conceptId);
      const existing = entry.byKey.get(note.key);
      entry.byKey.set(note.key, {
        weight: (existing?.weight ?? 0) + note.p * weight,
        lastAt: Math.max(existing?.lastAt ?? 0, session.updatedAt),
        sessions: (existing?.sessions ?? 0) + 1,
      });
      seen.add(note.conceptId);
    }

    // Records written before notes existed, and concepts a session did not settle.
    for (const response of session.probe) {
      if (quadrant(response) !== "SURE_WRONG") continue;
      const meta = session.itemMeta[baseItemId(response.itemId)];
      if (!meta || seen.has(meta.conceptId)) continue;
      at(meta.conceptId).unspecified += COARSE_NOTE_MASS * weight;
      seen.add(meta.conceptId);
    }

    for (const conceptId of seen) {
      const entry = at(conceptId);
      entry.lastAt = Math.max(entry.lastAt, session.updatedAt);
      entry.sessions += 1;
    }
  }

  return out;
}

/**
 * How much of the prior memory gets, given how much evidence it has.
 *
 * Saturating rather than clamped: one strong note is worth a nudge, several are
 * worth more, and no amount of history ever reaches MAX_PRIOR_MASS. A hard clamp
 * would make the tenth session's prior identical to the third's, which is both
 * wrong and invisible.
 */
export function priorMass(evidence: number): number {
  if (evidence <= 0) return 0;
  return MAX_PRIOR_MASS * (evidence / (evidence + 1));
}

/**
 * The starting distribution for one concept, or null when memory has nothing.
 *
 * Built as flat plus remembered mass rather than from the notes alone, so a belief
 * the learner has dropped is only weighted down, never ruled out: nothing here can
 * drive a hypothesis to zero, which is what would make a changed mind unprovable.
 */
export function priorFrom(
  recalled: Recall | undefined,
  keys: string[],
): number[] | null {
  if (!recalled || keys.length === 0) return null;

  const raw = keys.map((key) => recalled.byKey.get(key)?.weight ?? 0);
  if (recalled.unspecified > 0) {
    const misconceptions = keys.filter((key) => key !== SOUND).length;
    if (misconceptions > 0) {
      const each = recalled.unspecified / misconceptions;
      keys.forEach((key, i) => {
        if (key !== SOUND) raw[i] = (raw[i] ?? 0) + each;
      });
    }
  }

  const evidence = raw.reduce((sum, w) => sum + w, 0);
  if (evidence <= 0) return null;

  const mass = priorMass(evidence);
  const flat = (1 - mass) / keys.length;
  return raw.map((w) => flat + (mass * w) / evidence);
}

/** The PriorSource lib/belief.ts wants, closed over this browser's history. */
export function priorSource(
  sessions: SessionRecord[],
  opts: { now?: number; exclude?: string | null } = {},
): (conceptId: string, keys: string[]) => number[] | null {
  const recalled = recall(sessions, opts);
  return (conceptId, keys) => priorFrom(recalled.get(conceptId), keys);
}

/**
 * How long ago, in words. Locale-free on purpose: a date needs a format and a
 * timezone to be read, and "three weeks ago" needs neither.
 */
export function agoLabel(at: number, now: number): string {
  const days = Math.floor((now - at) / DAY_MS);
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/**
 * The line that tells a learner this is not the first time, or null.
 *
 * Written by the app from its own records rather than by the model, which cannot
 * know it and would be guessing. Refutation text is the model's job; what happened
 * in July is not.
 */
export function recallSentence(
  recalled: Recall | undefined,
  key: string,
  now: number,
): string | null {
  const held = recalled?.byKey.get(key);
  if (!held || held.weight < MIN_RECALL_TO_MENTION) return null;
  const when = agoLabel(held.lastAt, now);
  if (held.sessions > 1) {
    return `You have held this belief in ${held.sessions} earlier sessions, most recently ${when}.`;
  }
  return `You held this belief ${when} too.`;
}

/** Concepts with a remembered misconception, strongest first. */
export function rememberedMisconceptions(
  recalled: Map<string, Recall>,
): { conceptId: string; key: string; weight: number; lastAt: number }[] {
  const out: { conceptId: string; key: string; weight: number; lastAt: number }[] = [];
  for (const entry of recalled.values()) {
    for (const [key, held] of entry.byKey) {
      if (key === SOUND || held.weight < MIN_RECALL_TO_MENTION) continue;
      out.push({
        conceptId: entry.conceptId,
        key,
        weight: held.weight,
        lastAt: held.lastAt,
      });
    }
  }
  return out.sort((a, b) => b.weight - a.weight || b.lastAt - a.lastAt);
}
