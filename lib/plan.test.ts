import { describe, expect, it } from "vitest";
import { MAX_STEPS, packHref, planSummary, studyPlan } from "./plan";
import type { BeliefNote, Conf, Response, SessionRecord } from "./types";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 1);
const STROMA = "All of photosynthesis happens in the stroma.";

function answer(
  itemId: string,
  conf: Conf,
  correct: boolean,
  chosenOptionId = "a",
): Response {
  return { itemId, chosenOptionId, conf, correct, round: "probe" };
}

/** Two concepts in one pack, so a plan step can be pinned to one of them. */
function session(
  id: string,
  daysAgo: number,
  opts: {
    probe?: Response[];
    beliefs?: BeliefNote[];
    packId?: string;
    packTitle?: string;
    origin?: "builtin" | "custom";
  } = {},
): SessionRecord {
  const at = NOW - daysAgo * DAY;
  return {
    id,
    packId: opts.packId ?? "photosynthesis",
    packTitle: opts.packTitle ?? "Photosynthesis",
    origin: opts.origin ?? "builtin",
    startedAt: at,
    updatedAt: at,
    finished: true,
    probe: opts.probe ?? [answer("p-1", 3, false)],
    recheck: [],
    itemMeta: {
      "p-1": {
        conceptId: "light-reactions",
        topic: "Light reactions",
        stem: "Where do the light reactions happen?",
      },
      "p-2": {
        conceptId: "calvin-cycle",
        topic: "The Calvin cycle",
        stem: "Where is carbon fixed?",
      },
    },
    beliefs: opts.beliefs ?? [],
  };
}

describe("studyPlan with no history", () => {
  it("asks for one pack and nothing else", () => {
    const steps = studyPlan([], { now: NOW });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.kind).toBe("start");
    expect(steps[0]!.href).toBe("/");
  });

  it("treats a session with no answers as no history", () => {
    const empty = session("s-1", 1, { probe: [] });
    expect(studyPlan([empty], { now: NOW })[0]!.kind).toBe("start");
  });
});

describe("studyPlan ordering", () => {
  it("puts a belief history can name above a topic average", () => {
    const sessions = [
      session("s-1", 2, {
        probe: [answer("p-1", 3, false), answer("p-2", 3, false)],
        beliefs: [{ conceptId: "calvin-cycle", key: STROMA, p: 0.9 }],
      }),
    ];
    const steps = studyPlan(sessions, { now: NOW });
    expect(steps[0]!.kind).toBe("repair");
    expect(steps[0]!.conceptId).toBe("calvin-cycle");
    expect(steps[0]!.why).toContain(STROMA);
    // The concept already named is not repeated as a weak topic below itself.
    expect(steps.filter((s) => s.conceptId === "calvin-cycle")).toHaveLength(1);
  });

  it("names the pack the concept was last asked in", () => {
    const sessions = [
      session("s-1", 20, { packId: "photosynthesis", packTitle: "Photosynthesis" }),
      session("s-2", 1, {
        packId: "my-notes",
        packTitle: "My biology notes",
        origin: "custom",
        beliefs: [{ conceptId: "light-reactions", key: STROMA, p: 0.9 }],
      }),
    ];
    const step = studyPlan(sessions, { now: NOW })[0]!;
    expect(step.href).toBe("/custom/my-notes");
    expect(step.action).toContain("My biology notes");
  });

  it("offers a weak topic only when a miss was held with certainty", () => {
    const guessed = [session("s-1", 1, { probe: [answer("p-1", 1, false)] })];
    const kinds = studyPlan(guessed, { now: NOW }).map((s) => s.kind);
    expect(kinds).not.toContain("topic");

    const certain = [session("s-2", 1, { probe: [answer("p-1", 3, false)] })];
    expect(studyPlan(certain, { now: NOW }).map((s) => s.kind)).toContain("topic");
  });

  it("states the miss count behind a topic step", () => {
    const sessions = [
      session("s-1", 1, { probe: [answer("p-1", 3, false)] }),
      session("s-2", 2, { probe: [answer("p-1", 2, false)] }),
    ];
    const topic = studyPlan(sessions, { now: NOW }).find((s) => s.kind === "topic");
    expect(topic?.why).toContain("Missed 2 of 2");
    expect(topic?.why).toContain("2 of those were marked certain");
  });
});

describe("the calibration step", () => {
  const wide = [
    session("s-1", 1, {
      probe: [
        answer("p-1", 3, false),
        answer("p-2", 3, false),
        answer("p-3", 3, false),
        answer("p-4", 3, true),
        answer("p-5", 3, true),
        answer("p-6", 3, true),
      ],
    }),
  ];

  it("appears when certainty runs ahead of accuracy", () => {
    const step = studyPlan(wide, { now: NOW }).find((s) => s.kind === "calibration");
    expect(step).toBeDefined();
    expect(step!.why).toMatch(/points ahead of your accuracy/);
  });

  it("stays away until there are enough answers to mean anything", () => {
    const thin = [session("s-1", 1, { probe: [answer("p-1", 3, false)] })];
    expect(
      studyPlan(thin, { now: NOW }).some((s) => s.kind === "calibration"),
    ).toBe(false);
  });

  it("stays away when certainty already matches accuracy", () => {
    const calibrated = [
      session("s-1", 1, {
        probe: [
          answer("p-1", 1, false),
          answer("p-2", 1, false),
          answer("p-3", 2, true),
          answer("p-4", 2, true),
          answer("p-5", 3, true),
          answer("p-6", 3, true),
        ],
      }),
    ];
    expect(
      studyPlan(calibrated, { now: NOW }).some((s) => s.kind === "calibration"),
    ).toBe(false);
  });
});

describe("the spaced step", () => {
  const solid = (daysAgo: number) =>
    session("s-1", daysAgo, {
      probe: [answer("p-1", 3, true), answer("p-1", 3, true)],
    });

  it("appears for a topic answered right and not seen for a fortnight", () => {
    const step = studyPlan([solid(30)], { now: NOW }).find(
      (s) => s.kind === "spaced",
    );
    expect(step).toBeDefined();
    expect(step!.why).toContain("not asked since");
  });

  it("waits while the topic is still fresh", () => {
    expect(
      studyPlan([solid(3)], { now: NOW }).some((s) => s.kind === "spaced"),
    ).toBe(false);
  });

  it("does not call one correct answer solid", () => {
    const once = [session("s-1", 40, { probe: [answer("p-1", 3, true)] })];
    expect(
      studyPlan(once, { now: NOW }).some((s) => s.kind === "spaced"),
    ).toBe(false);
  });
});

describe("the plan as a whole", () => {
  it("never runs past what a person will read", () => {
    const sessions = [
      session("s-1", 1, {
        probe: [
          answer("p-1", 3, false),
          answer("p-2", 3, false, "b"),
          answer("p-3", 3, false),
          answer("p-4", 3, false, "b"),
          answer("p-5", 3, false),
          answer("p-6", 3, false, "b"),
        ],
        beliefs: [
          { conceptId: "light-reactions", key: STROMA, p: 0.9 },
          { conceptId: "calvin-cycle", key: "Carbon is fixed in the thylakoid.", p: 0.8 },
        ],
      }),
    ];
    const steps = studyPlan(sessions, { now: NOW });
    expect(steps.length).toBeLessThanOrEqual(MAX_STEPS);
    expect(steps.length).toBeGreaterThan(1);
  });

  it("gives every step somewhere to go and something to press", () => {
    const sessions = [session("s-1", 1, { probe: [answer("p-1", 3, false)] })];
    for (const step of studyPlan(sessions, { now: NOW })) {
      expect(step.href.startsWith("/")).toBe(true);
      expect(step.action.length).toBeGreaterThan(0);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.why.length).toBeGreaterThan(0);
    }
  });

  it("skips a concept no stored pack can be found for", () => {
    const orphan = session("s-1", 1, {
      probe: [answer("p-1", 3, false)],
      beliefs: [{ conceptId: "not-in-any-pack", key: STROMA, p: 0.9 }],
    });
    const steps = studyPlan([orphan], { now: NOW });
    expect(steps.some((s) => s.conceptId === "not-in-any-pack")).toBe(false);
  });
});

describe("packHref", () => {
  it("routes built-in and custom packs differently", () => {
    expect(packHref("builtin", "seasons")).toBe("/study/seasons");
    expect(packHref("custom", "abc123")).toBe("/custom/abc123");
  });
});

describe("planSummary", () => {
  it("says the plan is built from the learner's own answers", () => {
    expect(planSummary(studyPlan([], { now: NOW }))).toMatch(/your own answers/);
  });

  it("counts the carried beliefs when there are any", () => {
    const sessions = [
      session("s-1", 2, {
        probe: [answer("p-1", 3, false)],
        beliefs: [{ conceptId: "light-reactions", key: STROMA, p: 0.9 }],
      }),
    ];
    expect(planSummary(studyPlan(sessions, { now: NOW }))).toMatch(
      /the belief history says you are still holding/,
    );
  });

  it("drops the belief clause when nothing is carried", () => {
    const sessions = [session("s-1", 1, { probe: [answer("p-1", 3, false)] })];
    expect(planSummary(studyPlan(sessions, { now: NOW }))).toMatch(/worst first/);
  });
});
