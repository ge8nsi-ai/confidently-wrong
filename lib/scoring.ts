import type { Conf, Quadrant, Response } from "./types";

/** Stated probability implied by each certainty bucket. */
export function confToProb(conf: Conf): number {
  switch (conf) {
    case 1:
      return 0.4;
    case 2:
      return 0.7;
    case 3:
      return 0.9;
  }
}

export const CONF_LABEL: Record<Conf, string> = {
  1: "Guessing",
  2: "Fairly sure",
  3: "Certain",
};

/** Which of the four certainty x correctness cells a response falls into. */
export function quadrant(r: Response): Quadrant {
  if (r.conf >= 2) return r.correct ? "SURE_RIGHT" : "SURE_WRONG";
  return r.correct ? "UNSURE_RIGHT" : "UNSURE_WRONG";
}

/** Gardner-Medwin certainty-based marking table. */
const CBM: Record<Conf, { correct: number; wrong: number }> = {
  1: { correct: 1, wrong: 0 },
  2: { correct: 2, wrong: -2 },
  3: { correct: 3, wrong: -6 },
};

export function cbmScore(responses: Response[]): number {
  return responses.reduce((sum, r) => {
    const row = CBM[r.conf];
    return sum + (r.correct ? row.correct : row.wrong);
  }, 0);
}

/** Highest score obtainable on this many items (all correct at maximum certainty). */
export function cbmMax(responses: Response[]): number {
  return responses.length * CBM[3].correct;
}

/** Mean squared error between stated probability and outcome. Lower is better. */
export function brier(responses: Response[]): number {
  if (responses.length === 0) return 0;
  const total = responses.reduce((sum, r) => {
    const diff = confToProb(r.conf) - (r.correct ? 1 : 0);
    return sum + diff * diff;
  }, 0);
  return total / responses.length;
}

export function accuracy(responses: Response[]): number {
  if (responses.length === 0) return 0;
  return responses.filter((r) => r.correct).length / responses.length;
}

/** Mean stated confidence minus actual accuracy. Above zero means overconfident. */
export function overconfidence(responses: Response[]): number {
  if (responses.length === 0) return 0;
  const meanStated =
    responses.reduce((sum, r) => sum + confToProb(r.conf), 0) /
    responses.length;
  return meanStated - accuracy(responses);
}

export interface CalibrationBucket {
  conf: Conf;
  stated: number;
  observed: number;
  n: number;
}

/** One bucket per certainty level actually used, in ascending order. */
export function calibration(responses: Response[]): CalibrationBucket[] {
  const levels: Conf[] = [1, 2, 3];
  const buckets: CalibrationBucket[] = [];
  for (const conf of levels) {
    const inBucket = responses.filter((r) => r.conf === conf);
    if (inBucket.length === 0) continue;
    buckets.push({
      conf,
      stated: confToProb(conf),
      observed: accuracy(inBucket),
      n: inBucket.length,
    });
  }
  return buckets;
}

/**
 * The gating rule. A personalised refutation is only ever built for a belief the
 * learner actually held -- i.e. answered wrongly while feeling sure.
 */
export function needsRefutation(r: Response): boolean {
  return quadrant(r) === "SURE_WRONG";
}

export function countByQuadrant(responses: Response[]): Record<Quadrant, number> {
  const counts: Record<Quadrant, number> = {
    SURE_WRONG: 0,
    SURE_RIGHT: 0,
    UNSURE_RIGHT: 0,
    UNSURE_WRONG: 0,
  };
  for (const r of responses) counts[quadrant(r)] += 1;
  return counts;
}

/** Plain-English reading of the overconfidence number, for display under the chart. */
export function overconfidenceSentence(responses: Response[]): string {
  if (responses.length === 0) return "No answers yet.";
  const points = Math.round(overconfidence(responses) * 100);
  if (points >= 5)
    return `You were about ${points} points more sure than you were right.`;
  if (points <= -5)
    return `You were about ${Math.abs(points)} points less sure than you were right — you knew more than you gave yourself credit for.`;
  return "Your confidence matched your accuracy closely.";
}
