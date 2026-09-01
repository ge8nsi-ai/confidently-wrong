import { describe, expect, it } from "vitest";
import {
  MAX_CANDIDATES,
  MAX_PASSAGE_CHARS,
  MAX_QUERY_CHARS,
  MIN_PASSAGE_CHARS,
  fitCandidates,
  passages,
  rerank,
  retrievalQuery,
  retrieve,
  scorePassages,
} from "./retrieval";

/** A short document with a heading, two topics and a paragraph of figures. */
const MATERIAL = [
  "## The light reactions",
  "The light reactions happen in the thylakoid membranes of the chloroplast. Chlorophyll in the membrane absorbs photons and passes the energy along an electron transport chain. The products are ATP and NADPH, both of which stay inside the chloroplast.",
  "The Calvin cycle happens in the stroma, the fluid around the thylakoid stacks. Carbon fixation is the work of rubisco, which attaches carbon dioxide to a five-carbon sugar. The cycle spends the ATP and NADPH the light reactions made.",
  "A single chloroplast is about 5.5 micrometres across. That is 12.5 times the width of a typical mitochondrion in the same cell.",
].join("\n\n");

describe("passages", () => {
  it("keeps every passage inside the cap it promises", () => {
    for (const passage of passages(MATERIAL)) {
      expect(passage.length).toBeLessThanOrEqual(MAX_PASSAGE_CHARS);
    }
  });

  it("keeps a heading attached to the text under it", () => {
    const first = passages(MATERIAL)[0]!;
    expect(first.startsWith("## The light reactions")).toBe(true);
    expect(first).toContain("Chlorophyll");
  });

  it("breaks on paragraphs, so each topic stays in one passage", () => {
    const list = passages(MATERIAL);
    expect(list).toHaveLength(3);
    expect(list[1]).toContain("Calvin cycle");
    expect(list[1]).not.toContain("Chlorophyll");
  });

  it("does not split a decimal in half", () => {
    const list = passages(MATERIAL);
    expect(list[2]).toContain("5.5 micrometres");
    expect(list[2]).toContain("12.5 times");
  });

  it("has nothing to say about nothing", () => {
    expect(passages("")).toEqual([]);
    expect(passages("   \n\n \t ")).toEqual([]);
  });

  it("folds a short last paragraph back into the one before it", () => {
    const body =
      "Rubisco is the enzyme that fixes carbon, and it is the most abundant protein on Earth by mass.";
    const list = passages(`${body}\n\nSee figure 3.`);
    expect(list).toHaveLength(1);
    expect(list[0]).toContain("See figure 3.");
  });

  it("cuts a token no sentence break can help with", () => {
    const list = passages(`Reference: ${"a".repeat(900)}`);
    expect(list.length).toBeGreaterThan(1);
    for (const passage of list) {
      expect(passage.length).toBeLessThanOrEqual(MAX_PASSAGE_CHARS);
    }
  });
});

describe("scorePassages", () => {
  const list = [
    "Carbon fixation happens in the stroma of the chloroplast.",
    "Chlorophyll absorbs photons in the thylakoid membrane.",
    "Mitochondria respire sugar to release the energy stored in it.",
  ];

  it("puts the passage the query is about first", () => {
    const scored = scorePassages("where does carbon fixation happen", list);
    expect(scored[0]!.index).toBe(0);
  });

  it("drops the passages that share nothing with the query", () => {
    const scored = scorePassages("chlorophyll photons", list);
    expect(scored.map((s) => s.index)).toEqual([1]);
  });

  it("scores a term every passage contains as weak rather than negative", () => {
    const everywhere = [
      "Water moves up the stem of the plant.",
      "Water leaves the plant through the stomata.",
    ];
    for (const scored of scorePassages("water", everywhere)) {
      expect(scored.score).toBeGreaterThan(0);
    }
  });

  it("has nothing to rank in an empty document", () => {
    expect(scorePassages("carbon", [])).toEqual([]);
  });
});

describe("retrievalQuery", () => {
  const parts = {
    stem: "Where in the chloroplast is carbon fixed?",
    misconception: "Carbon is fixed in the thylakoid membrane.",
    correctOptionText: "Carbon is fixed in the stroma.",
  };

  it("leads with the belief and ends with the question", () => {
    const query = retrievalQuery(parts);
    expect(query.indexOf("thylakoid")).toBeLessThan(query.indexOf("stroma"));
    expect(query.indexOf("stroma")).toBeLessThan(query.indexOf("Where in"));
  });

  it("skips a part that is not there", () => {
    expect(retrievalQuery({ ...parts, misconception: "  " })).toBe(
      `${parts.correctOptionText} ${parts.stem}`,
    );
  });

  it("cuts a long query on a word boundary, spending the stem", () => {
    const query = retrievalQuery({ ...parts, stem: "why ".repeat(200) });
    expect(query.length).toBeLessThanOrEqual(MAX_QUERY_CHARS);
    expect(query.endsWith(" ")).toBe(false);
    expect(query).toContain("thylakoid");
  });
});

describe("retrieve", () => {
  it("finds the passage that speaks to the belief", () => {
    const found = retrieve(
      MATERIAL,
      retrievalQuery({
        stem: "Where in the chloroplast is carbon fixed?",
        misconception: "Carbon fixation happens in the thylakoid membrane.",
        correctOptionText: "Carbon fixation happens in the stroma.",
      }),
    );
    expect(found[0]).toContain("Calvin cycle happens in the stroma");
    expect(found.length).toBeLessThanOrEqual(MAX_CANDIDATES);
  });

  it("returns nothing when the material does not discuss the question", () => {
    expect(
      retrieve(MATERIAL, "The Treaty of Westphalia ended the Thirty Years War."),
    ).toEqual([]);
  });

  it("has nothing to retrieve without material or without a query", () => {
    expect(retrieve("", "carbon fixation stroma")).toEqual([]);
    expect(retrieve(MATERIAL, "   ")).toEqual([]);
    expect(retrieve(MATERIAL, "carbon fixation stroma", 0)).toEqual([]);
  });

  it("honours a smaller ceiling than the default", () => {
    expect(retrieve(MATERIAL, "chloroplast thylakoid stroma carbon", 1)).toHaveLength(
      1,
    );
  });

  it("will not quote a fragment too short to stand on its own", () => {
    for (const passage of retrieve(MATERIAL, "chloroplast thylakoid carbon stroma")) {
      expect(passage.length).toBeGreaterThanOrEqual(MIN_PASSAGE_CHARS);
    }
  });
});

describe("fitCandidates", () => {
  const base = { itemId: "photosynthesis-3", chosenOptionId: "b" };
  const bytesOf = (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value)).byteLength;

  it("keeps every candidate when the body has room", () => {
    const candidates = ["one passage", "another passage"];
    expect(fitCandidates(base, candidates, 4096)).toEqual(candidates);
  });

  it("drops from the end, so the lexical winner survives the cut", () => {
    const first = "a".repeat(80);
    const second = "b".repeat(80);
    const budget = bytesOf({ ...base, candidates: [first] });
    expect(fitCandidates(base, [first, second], budget)).toEqual([first]);
  });

  it("sends none rather than an oversized body", () => {
    expect(fitCandidates(base, ["x".repeat(80)], 10)).toEqual([]);
  });

  it("never sends more than the route will read", () => {
    const many = Array.from({ length: 6 }, (_, i) => `passage ${i}`);
    expect(fitCandidates(base, many, 4096)).toHaveLength(MAX_CANDIDATES);
  });

  it("counts bytes rather than characters", () => {
    const ascii = "a".repeat(60);
    const curly = "”".repeat(60);
    const budget = bytesOf({ ...base, candidates: [ascii] });
    expect(fitCandidates(base, [ascii], budget)).toEqual([ascii]);
    expect(fitCandidates(base, [curly], budget)).toEqual([]);
  });
});

describe("rerank", () => {
  const candidates = ["lexical winner", "the one embeddings prefer", "third"];

  it("picks the candidate closest to the query", () => {
    const vectors = [
      [1, 0],
      [0, 1],
      [1, 0],
      [0.2, 0.9],
    ];
    expect(rerank(candidates, vectors)).toBe("the one embeddings prefer");
  });

  it("leaves the lexical order standing on a tie", () => {
    const same = [
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
    ];
    expect(rerank(candidates, same)).toBe("lexical winner");
  });

  it("declines a reply about a different number of texts", () => {
    expect(
      rerank(candidates, [
        [1, 0],
        [1, 0],
      ]),
    ).toBeNull();
  });

  it("declines when nothing is similar at all", () => {
    expect(
      rerank(candidates, [
        [1, 0],
        [-1, 0],
        [0, 0],
        [-1, 0],
      ]),
    ).toBeNull();
  });

  it("has nothing to reorder without candidates", () => {
    expect(rerank([], [[1, 0]])).toBeNull();
  });
});
