/**
 * What to do next, in order, with the reason attached.
 *
 * The dashboard already ranked the weak topics, which answers "where am I bad" and
 * not "what should I open now". Those are different questions: the worst topic is
 * sometimes the wrong thing to study next, because a named belief the app watched
 * survive an explanation is more specific than a topic average, and a certainty gap
 * is not fixed by answering more questions at all.
 *
 * So the plan is built from the strongest evidence down: a misconception history
 * says is still held, then a topic missed while certain, then a calibration gap,
 * then something solid that has not been seen in a while. Every step states the
 * numbers behind it. Nothing here is a recommendation the record cannot support,
 * and nothing is offered that the app cannot actually do: there is no "resume that
 * abandoned run" step, because a run cannot be resumed.
 */

import { lifetimeStats } from "./history";
import { MEMORY_HALF_LIFE_DAYS, agoLabel, recall, rememberedMisconceptions } from "./memory";
import { topicStats, type TopicStat } from "./topics";
import type { SessionRecord } from "./types";

/** Steps shown at once. Past five, a plan is a backlog. */
export const MAX_STEPS = 5;

/** Named beliefs and weak topics are capped so one kind cannot fill the plan. */
const MAX_REPAIR = 2;
const MAX_TOPIC = 2;

/** Questions before a certainty gap means anything. One built-in pack clears it. */
const MIN_FOR_CALIBRATION = 6;

/** Points of overconfidence worth acting on rather than watching. */
const CALIBRATION_GAP = 10;

/** Days before something answered correctly is worth confirming again. */
const SPACED_AFTER_DAYS = 14;

/** Correct answers before a topic counts as solid rather than lucky. */
const MIN_SOLID_ATTEMPTS = 2;

const DAY_MS = 86_400_000;

export type PlanKind = "start" | "repair" | "topic" | "calibration" | "spaced";

export interface PlanStep {
  kind: PlanKind;
  /** The action, as an imperative. */
  title: string;
  /** What in the record produced this step, with the numbers in it. */
  why: string;
  /** Where the step goes, when there is somewhere to go. */
  href: string;
  action: string;
  /** Set when the step is about one concept, so the plan can avoid repeating it. */
  conceptId?: string;
}

/** Built-in packs are routes; custom packs live in this browser only. */
export function packHref(origin: "builtin" | "custom", packId: string): string {
  return origin === "custom" ? `/custom/${packId}` : `/study/${packId}`;
}

interface PackSource {
  packId: string;
  packTitle: string;
  origin: "builtin" | "custom";
  topic: string;
}

/**
 * The most recent pack that asked about this concept.
 *
 * Newest first, because a concept can appear in a built-in pack and in notes the
 * learner uploaded later, and the later one is the material they are working from.
 */
function sourcePack(
  sessions: SessionRecord[],
  conceptId: string,
): PackSource | null {
  const newest = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const session of newest) {
    for (const meta of Object.values(session.itemMeta)) {
      if (meta.conceptId !== conceptId) continue;
      return {
        packId: session.packId,
        packTitle: session.packTitle,
        origin: session.origin,
        topic: meta.topic,
      };
    }
  }
  return null;
}

/**
 * The plan.
 *
 * `now` is passed in rather than read, so the decay weights behind a step and the
 * "three weeks ago" in its sentence cannot disagree, and so a component can build
 * this during render without reading the clock.
 */
export function studyPlan(
  sessions: SessionRecord[],
  opts: { now?: number } = {},
): PlanStep[] {
  const now = opts.now ?? Date.now();
  const stats = lifetimeStats(sessions);

  if (stats.answered === 0) {
    return [
      {
        kind: "start",
        title: "Answer one pack all the way through.",
        href: "/",
        action: "Pick a pack",
        why: "Nothing is measured yet. Seven questions, each with how sure you are, is enough to place you on the calibration curve and to find the first belief worth repairing.",
      },
    ];
  }

  const steps: PlanStep[] = [];
  const used = new Set<string>();
  const recalled = recall(sessions, { now });

  // Strongest evidence first: a belief history can name, not a topic average.
  for (const held of rememberedMisconceptions(recalled)) {
    if (steps.length >= MAX_REPAIR) break;
    if (used.has(held.conceptId)) continue;
    const source = sourcePack(sessions, held.conceptId);
    if (!source) continue;
    used.add(held.conceptId);
    steps.push({
      kind: "repair",
      conceptId: held.conceptId,
      title: `Come back to ${source.topic}.`,
      href: packHref(source.origin, source.packId),
      action: `Open ${source.packTitle}`,
      why: `You were reading this as: ${held.key} That was ${agoLabel(held.lastAt, now)}, and nothing since has overturned it, so the next round will open there.`,
    });
  }

  const topics = topicStats(sessions);
  let added = 0;
  for (const stat of topics) {
    if (added >= MAX_TOPIC || steps.length >= MAX_STEPS) break;
    if (stat.sureWrong === 0 || used.has(stat.conceptId)) continue;
    const source = sourcePack(sessions, stat.conceptId);
    if (!source) continue;
    used.add(stat.conceptId);
    added += 1;
    steps.push({
      kind: "topic",
      conceptId: stat.conceptId,
      title: `Work through ${stat.topic}.`,
      href: packHref(source.origin, source.packId),
      action: `Open ${source.packTitle}`,
      why: `Missed ${stat.wrong} of ${stat.attempts} here, and ${stat.sureWrong} of those ${stat.sureWrong === 1 ? "was" : "were"} marked certain.`,
    });
  }

  const points = Math.round(stats.overconfidence * 100);
  if (
    steps.length < MAX_STEPS &&
    stats.answered >= MIN_FOR_CALIBRATION &&
    points >= CALIBRATION_GAP
  ) {
    const latest = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    steps.push({
      kind: "calibration",
      title: "Spend the next pack on the certainty buttons.",
      href: latest ? packHref(latest.origin, latest.packId) : "/",
      action: "Run a pack again",
      why: `Your certainty runs ${points} points ahead of your accuracy across ${stats.answered} questions. Marking "Fairly sure" when you are fairly sure costs one point and saves six, so the gap closes faster than your accuracy will.`,
    });
  }

  const due = spacedCandidate(topics, now);
  if (steps.length < MAX_STEPS && due) {
    const source = sourcePack(sessions, due.conceptId);
    if (source) {
      steps.push({
        kind: "spaced",
        conceptId: due.conceptId,
        title: `Check ${due.topic} is still there.`,
        href: packHref(source.origin, source.packId),
        action: `Open ${source.packTitle}`,
        why: `Right ${due.attempts} times out of ${due.attempts}, and not asked since ${agoLabel(due.lastSeenAt, now)}. That is about when a remembered belief is worth half what it was.`,
      });
    }
  }

  return steps.slice(0, MAX_STEPS);
}

/**
 * The solid topic that has gone longest without being asked.
 *
 * Two correct answers minimum, because one is as easily a guess that landed, and
 * this step is the only one in the plan not backed by a mistake.
 */
function spacedCandidate(topics: TopicStat[], now: number): TopicStat | null {
  const stale = topics.filter(
    (s) =>
      s.wrong === 0 &&
      s.attempts >= MIN_SOLID_ATTEMPTS &&
      now - s.lastSeenAt >= SPACED_AFTER_DAYS * DAY_MS,
  );
  if (stale.length === 0) return null;
  return stale.sort((a, b) => a.lastSeenAt - b.lastSeenAt)[0] ?? null;
}

/** One line above the list, so the plan says what ordered it. */
export function planSummary(steps: PlanStep[]): string {
  if (steps.length === 0) {
    return "Nothing to plan. No topic has been missed while certain and no belief is being carried.";
  }
  if (steps.length === 1 && steps[0]!.kind === "start") {
    return "Built from your own answers, so it stays empty until there are some.";
  }
  const half = `Beliefs carried between sessions lose half their weight every ${MEMORY_HALF_LIFE_DAYS} days.`;
  const carried = steps.filter((s) => s.kind === "repair").length;
  if (carried === 0) return `Ordered by what your answers show, worst first. ${half}`;
  return `Ordered by what your answers show, starting with ${carried === 1 ? "the belief" : `the ${carried} beliefs`} history says you are still holding. ${half}`;
}
