import { describe, expect, it } from "vitest";
import { SOUND, beliefStates, posterior, selectNextItem } from "./belief";
import {
  MAX_PRIOR_MASS,
  MEMORY_HALF_LIFE_DAYS,
  agoLabel,
  beliefNotes,
  decay,
  priorFrom,
  priorMass,
  priorSource,
  recall,
  recallSentence,
  rememberedMisconceptions,
} from "./memory";
import type { Conf, Item, Response, SessionRecord } from "./types";

const STROMA = "All of photosynthesis happens in the stroma.";
const MITOCHONDRIA = "Photosynthesis happens in mitochondria.";
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 1);

function item(id: string, conceptId = "light-reactions"): Item {
  return {
    id,
    conceptId,
    topic: "Light reactions",
    stem: `Where do the light reactions happen? (${id})`,
    options: [
      { id: "a", text: "In the stroma", correct: false, misconception: STROMA },
      { id: "b", text: "In the thylakoid membrane", correct: true },
      {
        id: "c",
        text: "In the mitochondria",
        correct: false,
        misconception: MITOCHONDRIA,
      },
    ],
    fallbackRefutation: { believe: "b", wrong: "w", actual: "a" },
  };
}

function answer(
  itemId: string,
  chosenOptionId: string,
  conf: Conf,
  correct = false,
): Response {
  return { itemId, chosenOptionId, conf, correct, round: "probe" };
}

const light = item("p-1");

/** A stored session, with notes unless the caller asks for the older shape. */
function session(
  id: string,
  daysAgo: number,
  opts: {
    beliefs?: { conceptId: string; key: string; p: number }[] | null;
    probe?: Response[];
    items?: Item[];
  } = {},
): SessionRecord {
  const items = opts.items ?? [light];
  const probe = opts.probe ?? [answer("p-1", "a", 3)];
  return {
    id,
    packId: "photosynthesis",
    packTitle: "Photosynthesis",
    origin: "builtin",
    startedAt: NOW - daysAgo * DAY,
    updatedAt: NOW - daysAgo * DAY,
    finished: true,
    probe,
    recheck: [],
    itemMeta: Object.fromEntries(
      items.map((i) => [
        i.id,
        { conceptId: i.conceptId, topic: i.topic ?? "", stem: i.stem },
      ]),
    ),
    ...(opts.beliefs === null
      ? {}
      : { beliefs: opts.beliefs ?? beliefNotes(items, probe) }),
  };
}

describe("beliefNotes", () => {
  it("records the settled belief, not the option that was clicked", () => {
    const notes = beliefNotes([light], [answer("p-1", "a", 3)]);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.key).toBe(STROMA);
    expect(notes[0]!.p).toBeGreaterThan(0.7);
  });

  it("records a sound concept too, because that is also predictable next time", () => {
    const notes = beliefNotes([light], [answer("p-1", "b", 3, true)]);
    expect(notes[0]!.key).toBe(SOUND);
  });

  it("writes nothing for a concept the session did not settle", () => {
    // One wrong answer flagged as a guess leaves the leader at 0.45, barely off the
    // flat third, which is noise rather than a finding.
    expect(beliefNotes([light], [answer("p-1", "a", 1)])).toEqual([]);
  });

  it("writes a note once two guesses point the same way", () => {
    const items = [light, item("p-2")];
    const notes = beliefNotes(items, [answer("p-1", "a", 1), answer("p-2", "a", 1)]);
    expect(notes.map((n) => n.key)).toEqual([STROMA]);
  });

  it("writes nothing for a concept nothing was asked about", () => {
    expect(beliefNotes([light], [])).toEqual([]);
  });

  it("rounds to three decimals so localStorage stays small", () => {
    const p = beliefNotes([light], [answer("p-1", "a", 3)])[0]!.p;
    expect(p).toBe(Math.round(p * 1000) / 1000);
  });
});

describe("decay", () => {
  it("halves over the half-life", () => {
    expect(decay(NOW, NOW)).toBeCloseTo(1);
    expect(decay(NOW - MEMORY_HALF_LIFE_DAYS * DAY, NOW)).toBeCloseTo(0.5);
    expect(decay(NOW - 2 * MEMORY_HALF_LIFE_DAYS * DAY, NOW)).toBeCloseTo(0.25);
  });

  it("never exceeds one, even for a clock that ran backwards", () => {
    expect(decay(NOW + 10 * DAY, NOW)).toBe(1);
  });
});

describe("recall", () => {
  it("carries the belief a session settled on", () => {
    const recalled = recall([session("s-1", 1)], { now: NOW });
    const entry = recalled.get("light-reactions")!;
    expect(entry.byKey.get(STROMA)!.weight).toBeGreaterThan(0.7);
    expect(entry.sessions).toBe(1);
  });

  it("weighs a recent session above an old one", () => {
    const fresh = recall([session("s-1", 1)], { now: NOW })
      .get("light-reactions")!
      .byKey.get(STROMA)!.weight;
    const stale = recall([session("s-1", 120)], { now: NOW })
      .get("light-reactions")!
      .byKey.get(STROMA)!.weight;
    expect(stale).toBeLessThan(fresh / 4);
  });

  it("adds up across sessions and counts them", () => {
    const one = recall([session("s-1", 1)], { now: NOW });
    const two = recall([session("s-1", 1), session("s-2", 3)], { now: NOW });
    const entry = two.get("light-reactions")!;
    expect(entry.byKey.get(STROMA)!.weight).toBeGreaterThan(
      one.get("light-reactions")!.byKey.get(STROMA)!.weight,
    );
    expect(entry.byKey.get(STROMA)!.sessions).toBe(2);
    expect(entry.lastAt).toBe(NOW - DAY);
  });

  it("never reads the session it is priming", () => {
    const only = recall([session("s-1", 1)], { now: NOW, exclude: "s-1" });
    expect(only.size).toBe(0);
  });

  it("falls back to coarse evidence for records written before notes existed", () => {
    const old = session("s-1", 1, { beliefs: null });
    const entry = recall([old], { now: NOW }).get("light-reactions")!;
    // It knows a misconception was held here and not which one.
    expect(entry.byKey.size).toBe(0);
    expect(entry.unspecified).toBeGreaterThan(0);
  });

  it("ignores a wrong answer that was flagged as a guess", () => {
    const guessed = session("s-1", 1, {
      beliefs: null,
      probe: [answer("p-1", "a", 1)],
    });
    expect(recall([guessed], { now: NOW }).size).toBe(0);
  });

  it("finds the concept behind a reworded recheck id", () => {
    const withVariant = session("s-1", 1, {
      beliefs: null,
      probe: [answer("p-1-v", "a", 3)],
    });
    const entry = recall([withVariant], { now: NOW }).get("light-reactions");
    expect(entry?.unspecified).toBeGreaterThan(0);
  });
});

describe("priorMass", () => {
  it("grows with evidence and never reaches the cap", () => {
    expect(priorMass(0)).toBe(0);
    expect(priorMass(1)).toBeLessThan(priorMass(4));
    expect(priorMass(1000)).toBeLessThan(MAX_PRIOR_MASS);
  });

  it("leaves this session's answers the larger share", () => {
    // The point of the cap: whatever history says, one probe round can outweigh it.
    expect(priorMass(50)).toBeLessThan(0.61);
  });
});

describe("priorFrom", () => {
  const keys = [SOUND, STROMA, MITOCHONDRIA];

  it("returns null when memory has nothing to say", () => {
    expect(priorFrom(undefined, keys)).toBeNull();
    expect(priorFrom(recall([], { now: NOW }).get("light-reactions"), keys)).toBeNull();
  });

  it("leans toward the remembered belief without ruling anything out", () => {
    const recalled = recall([session("s-1", 1)], { now: NOW });
    const prior = priorFrom(recalled.get("light-reactions"), keys)!;
    expect(prior.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(prior[1]).toBeGreaterThan(prior[0]!);
    // Nothing is driven to zero, or a learner who changed their mind could never
    // prove it.
    expect(Math.min(...prior)).toBeGreaterThan(0);
  });

  it("spreads unrecorded evidence over the misconceptions, not over being right", () => {
    const recalled = recall([session("s-1", 1, { beliefs: null })], { now: NOW });
    const prior = priorFrom(recalled.get("light-reactions"), keys)!;
    expect(prior[1]).toBeCloseTo(prior[2]!);
    expect(prior[1]).toBeGreaterThan(prior[0]!);
  });

  it("ignores a key list that does not match the concept", () => {
    const recalled = recall([session("s-1", 1)], { now: NOW });
    expect(priorFrom(recalled.get("light-reactions"), [])).toBeNull();
  });
});

describe("the prior inside the belief model", () => {
  const keys = [SOUND, STROMA, MITOCHONDRIA];
  const prior = priorSource([session("s-1", 2)], { now: NOW });

  it("starts a returning learner off the flat prior", () => {
    const flat = posterior(keys, [light], []);
    const carried = posterior(keys, [light], [], prior("light-reactions", keys));
    expect(flat[1]).toBeCloseTo(1 / 3);
    expect(carried[1]).toBeGreaterThan(flat[1]!);
  });

  it("marks the row as carried so the panel can say so", () => {
    const state = beliefStates([light], [], prior)[0]!;
    expect(state.fromMemory).toBe(true);
    expect(state.observations).toBe(0);
  });

  it("leaves a stranger flat", () => {
    const state = beliefStates([light], [], priorSource([], { now: NOW }))[0]!;
    expect(state.fromMemory).toBe(false);
    expect(state.hypotheses[0]!.probability).toBeCloseTo(1 / 3);
  });

  it("lets this session overturn what an earlier one concluded", () => {
    const changed = [answer("p-1", "b", 3, true), answer("p-2", "b", 3, true)];
    const items = [light, item("p-2")];
    const state = beliefStates(items, changed, priorSource([session("s-1", 2)], { now: NOW }))[0]!;
    expect(state.hypotheses[0]!.key).toBe(SOUND);
  });

  it("opens the round on the concept history did not settle", () => {
    const items = [item("p-1", "light-reactions"), item("p-2", "calvin-cycle")];
    // Flat, the pack plays in order. Remembering light-reactions makes p-1 the
    // predictable question, so the round should open on the other concept.
    expect(selectNextItem(items, [])!.id).toBe("p-1");
    expect(selectNextItem(items, [], prior)!.id).toBe("p-2");
  });
});

describe("agoLabel", () => {
  it("reads as a person would say it, with no locale or timezone", () => {
    expect(agoLabel(NOW, NOW)).toBe("earlier today");
    expect(agoLabel(NOW - DAY, NOW)).toBe("yesterday");
    expect(agoLabel(NOW - 3 * DAY, NOW)).toBe("3 days ago");
    expect(agoLabel(NOW - 9 * DAY, NOW)).toBe("last week");
    expect(agoLabel(NOW - 21 * DAY, NOW)).toBe("3 weeks ago");
    expect(agoLabel(NOW - 100 * DAY, NOW)).toBe("3 months ago");
  });
});

describe("recallSentence", () => {
  it("names the belief as one the learner has held before", () => {
    const recalled = recall([session("s-1", 1)], { now: NOW });
    expect(recallSentence(recalled.get("light-reactions"), STROMA, NOW)).toBe(
      "You held this belief yesterday too.",
    );
  });

  it("counts the sessions when it keeps coming back", () => {
    const recalled = recall([session("s-1", 1), session("s-2", 10)], { now: NOW });
    expect(recallSentence(recalled.get("light-reactions"), STROMA, NOW)).toContain(
      "2 earlier sessions",
    );
  });

  it("stays quiet about a belief that is barely remembered", () => {
    const faint = recall([session("s-1", 300)], { now: NOW });
    expect(recallSentence(faint.get("light-reactions"), STROMA, NOW)).toBeNull();
  });

  it("stays quiet when there is no history at all", () => {
    expect(recallSentence(undefined, STROMA, NOW)).toBeNull();
  });
});

describe("rememberedMisconceptions", () => {
  it("lists held misconceptions strongest first and leaves out being right", () => {
    const sound = session("s-2", 1, {
      items: [item("p-9", "calvin-cycle")],
      probe: [answer("p-9", "b", 3, true)],
    });
    const listed = rememberedMisconceptions(
      recall([session("s-1", 1), sound], { now: NOW }),
    );
    expect(listed.map((r) => r.key)).toEqual([STROMA]);
    expect(listed[0]!.conceptId).toBe("light-reactions");
  });
});
