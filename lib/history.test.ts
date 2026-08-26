import { describe, expect, it } from "vitest";
import {
  lifetimeStats,
  overconfidenceTrend,
  sortedSessions,
  summarizeSession,
} from "./history";
import { baseItemId, itemMetaFor, topicLabel, topicStats, weakTopics } from "./topics";
import { seasons } from "./packs";
import type { Conf, Item, Response, SessionRecord } from "./types";

function res(itemId: string, conf: Conf, correct: boolean): Response {
  return { itemId, chosenOptionId: "a", conf, correct, round: "probe" };
}

function session(
  id: string,
  updatedAt: number,
  probe: Response[],
  items: Item[] = seasons.items,
): SessionRecord {
  return {
    id,
    packId: "seasons",
    packTitle: "How summers work",
    origin: "builtin",
    startedAt: updatedAt - 1000,
    updatedAt,
    finished: true,
    probe,
    recheck: [],
    itemMeta: itemMetaFor(items),
  };
}

describe("topic labels", () => {
  it("prefers a supplied label, then a curated one, then the humanised slug", () => {
    expect(topicLabel("cause-of-seasons", "Custom label")).toBe("Custom label");
    expect(topicLabel("cause-of-seasons")).toBe("What causes seasons");
    expect(topicLabel("photosynthesis-light-reactions")).toBe(
      "Photosynthesis light reactions",
    );
  });

  it("maps a recheck variant back onto its original item", () => {
    expect(baseItemId("seasons-1-v")).toBe("seasons-1");
    expect(baseItemId("seasons-1")).toBe("seasons-1");
  });

  it("builds metadata covering every item in a pack", () => {
    const meta = itemMetaFor(seasons.items);
    expect(Object.keys(meta)).toHaveLength(seasons.items.length);
    expect(meta["seasons-1"]!.topic).toBe("What causes seasons");
  });
});

describe("topic weakness", () => {
  const sessions = [
    session("s1", 2_000, [
      res("seasons-1", 3, false), // confidently wrong
      res("seasons-2", 1, false), // wrong, but a guess
      res("seasons-3", 3, true),
    ]),
    session("s2", 3_000, [
      res("seasons-1", 2, false), // confidently wrong again
      res("seasons-3", 2, true),
    ]),
  ];

  it("ranks a repeatedly confidently-wrong topic above an honestly guessed one", () => {
    const ranked = topicStats(sessions);
    expect(ranked[0]!.conceptId).toBe("cause-of-seasons");
    expect(ranked[0]!.attempts).toBe(2);
    expect(ranked[0]!.wrong).toBe(2);
    expect(ranked[0]!.sureWrong).toBe(2);
    expect(ranked[0]!.weakness).toBe(2);

    const guessed = ranked.find((s) => s.conceptId === "perihelion")!;
    expect(guessed.sureWrong).toBe(0);
    expect(guessed.weakness).toBe(1);
  });

  it("leaves topics that were never missed out of the weak list", () => {
    const weak = weakTopics(sessions).map((s) => s.conceptId);
    expect(weak).toContain("cause-of-seasons");
    expect(weak).not.toContain("hemispheres");
  });

  it("counts each attempt across sessions and tracks where it was seen", () => {
    const stat = topicStats(sessions).find((s) => s.conceptId === "hemispheres")!;
    expect(stat.attempts).toBe(2);
    expect(stat.wrong).toBe(0);
    expect(stat.packTitles).toEqual(["How summers work"]);
  });

  it("ignores responses whose item is missing from the stored metadata", () => {
    const orphan = session("s3", 4_000, [res("not-in-pack", 3, false)]);
    expect(topicStats([orphan])).toEqual([]);
  });

  it("returns nothing for no sessions", () => {
    expect(topicStats([])).toEqual([]);
    expect(weakTopics([])).toEqual([]);
  });
});

describe("session summaries", () => {
  it("summarises one session without touching the store", () => {
    const summary = summarizeSession(
      session("s1", 5_000, [
        res("seasons-1", 3, false),
        res("seasons-2", 3, true),
      ]),
    );
    expect(summary.answered).toBe(2);
    expect(summary.correct).toBe(1);
    expect(summary.sureWrong).toBe(1);
    expect(summary.cbm).toBe(-3); // +3 correct at conf 3, -6 wrong at conf 3
    expect(summary.cbmMax).toBe(6);
    expect(summary.recheckSureWrong).toBeNull();
  });

  it("orders history newest first", () => {
    const list = sortedSessions([
      session("old", 1_000, [res("seasons-1", 1, true)]),
      session("new", 9_000, [res("seasons-1", 1, true)]),
    ]);
    expect(list.map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("aggregates lifetime totals across sessions", () => {
    const stats = lifetimeStats([
      session("s1", 1_000, [res("seasons-1", 3, false)]),
      session("s2", 2_000, [res("seasons-2", 3, true)]),
    ]);
    expect(stats.sessions).toBe(2);
    expect(stats.answered).toBe(2);
    expect(stats.accuracy).toBe(0.5);
    expect(stats.sureWrong).toBe(1);
  });

  it("builds an oldest-first trend and skips empty sessions", () => {
    const trend = overconfidenceTrend([
      session("later", 2_000, [res("seasons-1", 3, true)]),
      session("empty", 3_000, []),
      session("earlier", 1_000, [res("seasons-1", 3, false)]),
    ]);
    expect(trend.map((p) => p.label)).toEqual(["1", "2"]);
    expect(trend[0]!.accuracy).toBe(0);
    expect(trend[1]!.accuracy).toBe(100);
  });

  it("handles an empty history without dividing by zero", () => {
    const stats = lifetimeStats([]);
    expect(stats.accuracy).toBe(0);
    expect(stats.overconfidence).toBe(0);
    expect(overconfidenceTrend([])).toEqual([]);
  });
});
