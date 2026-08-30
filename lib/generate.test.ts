/**
 * The generation loop was five sequential gates, and the wait was the sum of all
 * of them. What this pins is the one overlap that changed: the next question is
 * asked while the current one is being verified, so the wall clock per kept item
 * is the longer of the two calls rather than their total.
 *
 * The Mistral module is mocked at the seam, so no call leaves the machine and the
 * order of the calls is the thing under test. Each mocked reply is a real reply
 * shape: an unparseable stand-in would be rejected by the gates and the loop would
 * never reach the behaviour being measured.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const chatJson = vi.fn();
const embed = vi.fn();

vi.mock("./mistral", () => ({
  chatJson: (...args: unknown[]) => chatJson(...args),
  embed: (...args: unknown[]) => embed(...args),
}));

const { generateItems } = await import("./generate");

/**
 * Material that answers the questions below verbatim, so the citation gate can
 * find the span it asks for instead of throwing the item out as ungrounded.
 */
const MATERIAL = [
  "The light reactions of photosynthesis happen in the thylakoid membrane.",
  "The Calvin cycle runs in the stroma and fixes carbon dioxide into sugar.",
].join(" ");

/**
 * Two replies in the shape the generate prompt asks for.
 *
 * They have to be about different things rather than numbered variants of one
 * question: the loop's own duplicate gate would throw the second away, and the
 * attempt that replaced it would be the thing measured instead of the overlap.
 */
const REPLIES = [
  {
    conceptId: "light-reactions",
    topic: "Light reactions",
    stem: "Where do the light reactions of photosynthesis happen?",
    correct: "In the thylakoid membrane",
    quote: "The light reactions of photosynthesis happen in the thylakoid membrane.",
    distractors: [
      { text: "In the stroma", misconception: "All of photosynthesis happens in the stroma." },
      { text: "In the mitochondria", misconception: "Photosynthesis happens in mitochondria." },
      { text: "In the cell wall", misconception: "The cell wall carries out photosynthesis." },
    ],
    fallbackRefutation: {
      believe: "You believe the light reactions happen in the stroma.",
      wrong: "The stroma is where the Calvin cycle runs, not the light reactions.",
      actual: "The light reactions run in the thylakoid membrane and make ATP and NADPH.",
    },
  },
  {
    conceptId: "calvin-cycle",
    topic: "Calvin cycle",
    stem: "What does the Calvin cycle do with carbon dioxide?",
    correct: "Fixes it into sugar",
    quote: "The Calvin cycle runs in the stroma and fixes carbon dioxide into sugar.",
    distractors: [
      { text: "Releases it as waste", misconception: "The Calvin cycle gives off carbon dioxide." },
      { text: "Splits it to make oxygen", misconception: "The oxygen a plant releases comes from carbon dioxide." },
      { text: "Stores it unchanged", misconception: "Carbon dioxide is banked rather than built into anything." },
    ],
    fallbackRefutation: {
      believe: "You believe the Calvin cycle releases carbon dioxide.",
      wrong: "It consumes carbon dioxide rather than giving it off.",
      actual: "The Calvin cycle fixes carbon dioxide into sugar, in the stroma.",
    },
  },
];

/** The nth reply, cycling, without the citation field the mock answers with. */
function generated(n: number) {
  const reply = { ...REPLIES[(n - 1) % REPLIES.length]! } as Partial<
    (typeof REPLIES)[number]
  >;
  delete reply.quote;
  return reply;
}

/**
 * The verification reply for whichever question the call is about.
 *
 * Matched on the stem in the user prompt rather than on call order, because the
 * whole point of the change under test is that the calls no longer arrive in a
 * fixed order.
 */
function verifyReply(kind: string, messages: { role: string; content: string }[]) {
  const user = messages.find((m) => m.role === "user")?.content ?? "";
  const reply = REPLIES.find((r) => user.includes(r.stem));
  if (kind === "challenge") {
    // The option letters depend on the shuffle, so the letter of the right answer
    // is read out of the prompt rather than assumed to be the first one.
    const line = user
      .split("\n")
      .find((l) => reply && l.includes(reply.correct) && /^\s*[a-z][).]/.test(l));
    const letter = /^\s*([a-z])[).]/.exec(line ?? "")?.[1] ?? "a";
    return { answer: letter, why: "That is the option the source supports." };
  }
  return { quote: reply?.quote ?? "" };
}

/** Which prompt a `chatJson` call carries, by the system prompt it was given. */
function kindOf(messages: { role: string; content: string }[]): string {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  if (system.startsWith("You answer one multiple-choice question")) return "challenge";
  if (system.startsWith("You locate the span")) return "grounding";
  return "generate";
}

let deferredVerify: (() => void)[] = [];

beforeEach(() => {
  chatJson.mockReset();
  embed.mockReset();
  deferredVerify = [];
  // No vector means the paraphrase gate stands down and the word-overlap verdict
  // is left to do the work, which keeps this test off the embedding path.
  embed.mockResolvedValue([]);
});

describe("generateItems", () => {
  it("asks the next question while the current one is still being verified", async () => {
    let asked = 0;

    chatJson.mockImplementation((messages: { role: string; content: string }[]) => {
      const kind = kindOf(messages);
      if (kind === "generate") {
        asked += 1;
        return Promise.resolve(generated(asked));
      }
      // Both verification calls are held open. If the loop waited for them, the
      // second generate call could never be recorded before they resolve.
      return new Promise((resolve) => {
        deferredVerify.push(() => resolve(verifyReply(kind, messages)));
      });
    });

    const run = generateItems({ material: MATERIAL, count: 2, packId: "p" });

    // Let the first generate call and the two verification calls be made.
    await vi.waitFor(() => expect(deferredVerify.length).toBe(2));
    // The overlap itself: a second question is in flight with the first unverified.
    await vi.waitFor(() => expect(asked).toBe(2));

    for (const release of deferredVerify.splice(0)) release();
    await vi.waitFor(() => expect(deferredVerify.length).toBe(2));
    for (const release of deferredVerify.splice(0)) release();

    const outcome = await run;
    expect(outcome.items).toHaveLength(2);
    // Two questions, and no third one paid for once the pack was full.
    expect(asked).toBe(2);
  });

  it("does not prefetch a question the pack has no room for", async () => {
    let asked = 0;
    chatJson.mockImplementation((messages: { role: string; content: string }[]) => {
      const kind = kindOf(messages);
      if (kind === "generate") {
        asked += 1;
        return Promise.resolve(generated(asked));
      }
      return Promise.resolve(verifyReply(kind, messages));
    });

    const outcome = await generateItems({
      material: MATERIAL,
      count: 1,
      packId: "p",
    });
    expect(outcome.items).toHaveLength(1);
    expect(asked).toBe(1);
  });

  it("records a prefetched call that failed against the attempt that awaited it", async () => {
    let asked = 0;
    chatJson.mockImplementation((messages: { role: string; content: string }[]) => {
      const kind = kindOf(messages);
      if (kind === "generate") {
        asked += 1;
        // The second question, the prefetched one, comes back as a network failure.
        if (asked === 2) return Promise.reject(new Error("upstream timeout"));
        return Promise.resolve(generated(asked === 1 ? 1 : 2));
      }
      return Promise.resolve(verifyReply(kind, messages));
    });

    const outcome = await generateItems({
      material: MATERIAL,
      count: 2,
      packId: "p",
    });
    expect(outcome.items).toHaveLength(2);
    const failed = outcome.rejections.filter((r) => r.stage === "error");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.reason).toContain("upstream timeout");
  });
});
