/**
 * Topic labels and weakness ranking. Pure functions only, in the same spirit as
 * lib/scoring.ts: the dashboard derives everything on demand and stores nothing.
 */

import { quadrant } from "./scoring";
import type { Item, ItemMeta, Response, SessionRecord } from "./types";

/** Slugs that do not read well when mechanically humanised. */
const LABELS: Record<string, string> = {
  "cause-of-seasons": "What causes seasons",
  perihelion: "Distance to the Sun",
  hemispheres: "Opposite hemispheres",
  equator: "The equator",
  "sun-overhead": "Sun directly overhead",
  "sunlight-angle": "Angle of sunlight",
  lag: "Seasonal lag",
  "individual-vs-population": "Individuals against populations",
  "not-goal-directed": "Evolution has no goal",
  "variation-precedes-need": "Variation comes first",
  fitness: "What fitness means",
  "mutation-randomness": "Randomness of mutation",
  "use-disuse": "Use and disuse",
  "species-intent": "Species do not intend",
  "correlation-causation": "Correlation and causation",
  "gamblers-fallacy": "The gambler's fallacy",
  "base-rate": "Base rates",
  "sample-size": "Sample size",
  "small-sample-extremes": "Extremes in small samples",
  "regression-to-mean": "Regression to the mean",
  conjunction: "The conjunction fallacy",
};

export function humanizeConcept(conceptId: string): string {
  const words = conceptId.replace(/[-_]+/g, " ").trim();
  if (words.length === 0) return "Untitled topic";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function topicLabel(conceptId: string, given?: string): string {
  const supplied = given?.trim();
  if (supplied) return supplied;
  return LABELS[conceptId] ?? humanizeConcept(conceptId);
}

/** Recheck variants carry an item id of `${baseId}-v`; history keys on the base. */
export function baseItemId(itemId: string): string {
  return itemId.endsWith("-v") ? itemId.slice(0, -2) : itemId;
}

export function itemMetaFor(items: Item[]): Record<string, ItemMeta> {
  const meta: Record<string, ItemMeta> = {};
  for (const item of items) {
    meta[item.id] = {
      conceptId: item.conceptId,
      topic: topicLabel(item.conceptId, item.topic),
      stem: item.stem,
    };
  }
  return meta;
}

export interface TopicStat {
  conceptId: string;
  topic: string;
  /** Packs this topic was seen in, for display. */
  packTitles: string[];
  attempts: number;
  wrong: number;
  sureWrong: number;
  lastSeenAt: number;
  /** 0 = never missed, 1 = always missed, above 1 = missed with certainty. */
  weakness: number;
}

/**
 * Ranks topics worst-first. A miss held with certainty counts double, because a
 * confidently wrong belief is the thing this app exists to surface.
 */
export function topicStats(sessions: SessionRecord[]): TopicStat[] {
  const byConcept = new Map<string, TopicStat>();

  for (const session of sessions) {
    for (const response of session.probe) {
      const meta = session.itemMeta[baseItemId(response.itemId)];
      if (!meta) continue;

      let stat = byConcept.get(meta.conceptId);
      if (!stat) {
        stat = {
          conceptId: meta.conceptId,
          topic: meta.topic,
          packTitles: [],
          attempts: 0,
          wrong: 0,
          sureWrong: 0,
          lastSeenAt: 0,
          weakness: 0,
        };
        byConcept.set(meta.conceptId, stat);
      }

      stat.attempts += 1;
      if (!response.correct) stat.wrong += 1;
      if (quadrant(response) === "SURE_WRONG") stat.sureWrong += 1;
      stat.lastSeenAt = Math.max(stat.lastSeenAt, session.updatedAt);
      if (!stat.packTitles.includes(session.packTitle)) {
        stat.packTitles.push(session.packTitle);
      }
    }
  }

  const stats = [...byConcept.values()];
  for (const stat of stats) {
    stat.weakness =
      stat.attempts === 0
        ? 0
        : (stat.wrong + stat.sureWrong) / stat.attempts;
  }

  return stats.sort(
    (a, b) =>
      b.weakness - a.weakness ||
      b.sureWrong - a.sureWrong ||
      b.lastSeenAt - a.lastSeenAt ||
      a.topic.localeCompare(b.topic),
  );
}

/** Topics worth studying next: missed at least once, worst first. */
export function weakTopics(sessions: SessionRecord[], limit = 6): TopicStat[] {
  return topicStats(sessions)
    .filter((s) => s.wrong > 0)
    .slice(0, limit);
}

/** Topics answered correctly every time they came up. */
export function solidTopics(sessions: SessionRecord[]): TopicStat[] {
  return topicStats(sessions).filter((s) => s.wrong === 0 && s.attempts > 0);
}

export function allResponses(sessions: SessionRecord[]): Response[] {
  return sessions.flatMap((s) => s.probe);
}
