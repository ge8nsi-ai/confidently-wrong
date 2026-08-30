import { beforeEach, describe, expect, it } from "vitest";
import { useStudy } from "./store";
import { DEFAULT_TARGET, MAX_TARGET } from "./endless";
import type { Item, Pack } from "./types";

function item(n: number): Item {
  return {
    id: `custom-p-${n}`,
    conceptId: `c-${n}`,
    topic: `topic ${n}`,
    stem: `stem ${n}?`,
    options: [
      { id: "a", text: "right", correct: true },
      { id: "b", text: "wrong", correct: false, misconception: `m-${n}` },
    ],
    fallbackRefutation: { believe: "x", wrong: "y", actual: "z" },
  };
}

function endlessPack(items: number, target = DEFAULT_TARGET): Pack {
  return {
    id: "custom-p",
    title: "Your material",
    blurb: "b",
    origin: "custom",
    items: Array.from({ length: items }, (_, i) => item(i)),
    endless: true,
    target,
    material: "some material to write from",
  };
}

/** Answers the first unanswered question correctly, as the card would. */
function answerNext(): void {
  const { pack, responses, answer } = useStudy.getState();
  const done = new Set(responses.map((r) => r.itemId));
  const next = pack?.items.find((i) => !done.has(i.id));
  if (!next) throw new Error("nothing left to answer");
  answer(next, "a", 2);
}

beforeEach(() => {
  useStudy.getState().reset();
  useStudy.setState({ sessions: [], customPacks: [] });
});

describe("appendItems", () => {
  it("adds a background batch to the pack being played", () => {
    useStudy.getState().startPack(endlessPack(3));
    useStudy.getState().appendItems([item(3), item(4), item(5)]);
    expect(useStudy.getState().pack?.items).toHaveLength(6);
  });

  it("drops ids already present, so a retried batch cannot duplicate a question", () => {
    useStudy.getState().startPack(endlessPack(3));
    useStudy.getState().appendItems([item(2), item(3)]);
    const ids = useStudy.getState().pack?.items.map((i) => i.id) ?? [];
    expect(ids).toEqual([
      "custom-p-0",
      "custom-p-1",
      "custom-p-2",
      "custom-p-3",
    ]);
  });

  it("writes through to the saved custom pack, which is what the page reads", () => {
    const pack = endlessPack(3);
    useStudy.getState().saveCustomPack(pack);
    useStudy.getState().startPack(pack);
    useStudy.getState().appendItems([item(3)]);
    const saved = useStudy.getState().customPacks.find((p) => p.id === pack.id);
    expect(saved?.items).toHaveLength(4);
  });

  it("ignores an empty batch", () => {
    useStudy.getState().startPack(endlessPack(3));
    useStudy.getState().appendItems([]);
    expect(useStudy.getState().pack?.items).toHaveLength(3);
  });
});

describe("setTarget", () => {
  it("raises the target and clamps at the ceiling", () => {
    const pack = endlessPack(3);
    useStudy.getState().saveCustomPack(pack);
    useStudy.getState().startPack(pack);

    useStudy.getState().setTarget(15);
    expect(useStudy.getState().pack?.target).toBe(15);

    useStudy.getState().setTarget(9999);
    expect(useStudy.getState().pack?.target).toBe(MAX_TARGET);
    expect(
      useStudy.getState().customPacks.find((p) => p.id === pack.id)?.target,
    ).toBe(MAX_TARGET);
  });

  it("does nothing to a fixed pack", () => {
    useStudy.getState().startPack({ ...endlessPack(3), endless: false });
    useStudy.getState().setTarget(20);
    expect(useStudy.getState().pack?.target).toBe(DEFAULT_TARGET);
  });
});

describe("the endless probe round ends on the target, not on the list", () => {
  it("stays in the probe round when the questions run out early", () => {
    useStudy.getState().startPack(endlessPack(3, 5));
    answerNext();
    answerNext();
    answerNext();
    // Every question that has arrived is answered, but the target wants five.
    expect(useStudy.getState().phase).toBe("probe");
  });

  it("reveals once the target is met, even with questions still in hand", () => {
    useStudy.getState().startPack(endlessPack(6, 5));
    for (let i = 0; i < 5; i += 1) answerNext();
    expect(useStudy.getState().phase).toBe("reveal");
    expect(useStudy.getState().pack?.items).toHaveLength(6);
  });

  it("counts a batch that lands mid-round towards the same target", () => {
    useStudy.getState().startPack(endlessPack(3, 5));
    answerNext();
    answerNext();
    answerNext();
    useStudy.getState().appendItems([item(3), item(4)]);
    answerNext();
    expect(useStudy.getState().phase).toBe("probe");
    answerNext();
    expect(useStudy.getState().phase).toBe("reveal");
  });

  it("writes history when an endless round is stopped early at the reveal", () => {
    useStudy.getState().startPack(endlessPack(6, 20));
    answerNext();
    answerNext();
    useStudy.getState().setPhase("reveal");
    const [record] = useStudy.getState().sessions;
    expect(record?.probe).toHaveLength(2);
    expect(record?.finished).toBe(false);
  });
});
