/**
 * Session history summaries. Pure functions; the store holds the raw records and
 * this file derives everything the dashboard shows.
 */

import { accuracy, cbmScore, cbmMax, countByQuadrant, overconfidence } from "./scoring";
import type { Response, SessionRecord } from "./types";

export interface SessionSummary {
  id: string;
  packId: string;
  packTitle: string;
  origin: "builtin" | "custom";
  startedAt: number;
  updatedAt: number;
  finished: boolean;
  answered: number;
  correct: number;
  sureWrong: number;
  cbm: number;
  cbmMax: number;
  accuracy: number;
  overconfidence: number;
  /** Confidently-wrong count after the recheck round, when there was one. */
  recheckSureWrong: number | null;
}

export function summarizeSession(session: SessionRecord): SessionSummary {
  const probe = session.probe;
  const counts = countByQuadrant(probe);
  return {
    id: session.id,
    packId: session.packId,
    packTitle: session.packTitle,
    origin: session.origin,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    finished: session.finished,
    answered: probe.length,
    correct: probe.filter((r) => r.correct).length,
    sureWrong: counts.SURE_WRONG,
    cbm: cbmScore(probe),
    cbmMax: cbmMax(probe),
    accuracy: accuracy(probe),
    overconfidence: overconfidence(probe),
    recheckSureWrong:
      session.recheck.length > 0
        ? countByQuadrant(session.recheck).SURE_WRONG
        : null,
  };
}

/** Newest first. */
export function sortedSessions(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface LifetimeStats {
  sessions: number;
  answered: number;
  accuracy: number;
  sureWrong: number;
  overconfidence: number;
  cbm: number;
  cbmMax: number;
}

export function lifetimeStats(sessions: SessionRecord[]): LifetimeStats {
  const all: Response[] = sessions.flatMap((s) => s.probe);
  return {
    sessions: sessions.length,
    answered: all.length,
    accuracy: accuracy(all),
    sureWrong: countByQuadrant(all).SURE_WRONG,
    overconfidence: overconfidence(all),
    cbm: cbmScore(all),
    cbmMax: cbmMax(all),
  };
}

/** Oldest first, for a trend line across sessions. */
export interface TrendPoint {
  label: string;
  overconfidence: number;
  accuracy: number;
  sureWrong: number;
}

export function overconfidenceTrend(sessions: SessionRecord[]): TrendPoint[] {
  return [...sessions]
    .filter((s) => s.probe.length > 0)
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .map((session, i) => ({
      label: `${i + 1}`,
      overconfidence: Math.round(overconfidence(session.probe) * 100),
      accuracy: Math.round(accuracy(session.probe) * 100),
      sureWrong: countByQuadrant(session.probe).SURE_WRONG,
    }));
}
