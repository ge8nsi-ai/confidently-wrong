import { STYLE_DIRECTIVE, STYLES, type Style } from "./escalation";
import {
  MAX_CANDIDATES,
  MAX_PASSAGE_CHARS,
  fitCandidates,
  retrieve,
  retrievalQuery,
} from "./retrieval";
import type { Refutation } from "./types";

export const MAX_BODY_BYTES = 4 * 1024;

export interface RefuteRequest {
  itemId: string;
  chosenOptionId: string;
  stem: string;
  chosenOptionText: string;
  misconception: string;
  correctOptionText: string;
  fallbackRefutation: Refutation;
  /**
   * How to frame the explanation. Absent means the first attempt, which is the only
   * kind of request the route received before escalation existed.
   */
  style: Style;
  /**
   * Passages of the learner's own material that speak to this belief, best first,
   * chosen in the browser because that is where the material lives. Empty for the
   * built-in packs, which have no material, and empty when nothing in an upload came
   * close enough to be worth quoting.
   */
  candidates: string[];
}


function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0 || t.length > max) return null;
  return t;
}

/** An unrecognised style falls back to the first one rather than failing the call. */
function parseStyle(v: unknown): Style {
  return typeof v === "string" && (STYLES as readonly string[]).includes(v)
    ? (v as Style)
    : STYLES[0]!;
}

/**
 * The retrieved passages, or none.
 *
 * Missing and unusable are the same answer here. A request with no candidates is a
 * built-in pack, which has no material, and an ungrounded explanation is the right
 * outcome for it rather than a 400. So a bad entry is dropped on its own and the rest
 * of the request stands: one malformed passage is no reason to refuse an explanation
 * a learner is waiting on.
 *
 * The length cap is the one passages() promises, checked again here because the client
 * is a browser and anything a browser sends can be edited.
 */
function candidateList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const entry of v) {
    if (out.length >= MAX_CANDIDATES) break;
    const passage = str(entry, MAX_PASSAGE_CHARS);
    if (passage) out.push(passage);
  }
  return out;
}

export function parseRefutation(value: unknown): Refutation | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const believe = str(v.believe, 400);
  const wrong = str(v.wrong, 400);
  const actual = str(v.actual, 600);
  if (!believe || !wrong || !actual) return null;
  return { believe, wrong, actual };
}

export function parseRefuteRequest(value: unknown): RefuteRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const itemId = str(v.itemId, 80);
  const chosenOptionId = str(v.chosenOptionId, 80);
  const stem = str(v.stem, 600);
  const chosenOptionText = str(v.chosenOptionText, 400);
  const misconception = str(v.misconception, 400);
  const correctOptionText = str(v.correctOptionText, 400);
  const fallbackRefutation = parseRefutation(v.fallbackRefutation);
  if (
    !itemId ||
    !chosenOptionId ||
    !stem ||
    !chosenOptionText ||
    !misconception ||
    !correctOptionText ||
    !fallbackRefutation
  ) {
    return null;
  }
  return {
    itemId,
    chosenOptionId,
    stem,
    chosenOptionText,
    misconception,
    correctOptionText,
    fallbackRefutation,
    style: parseStyle(v.style),
    candidates: candidateList(v.candidates),
  };
}

const BASE_SYSTEM_PROMPT = `You write short refutation texts for a learner who answered a question wrongly while feeling certain. You get the question, the specific wrong option they chose, and the misconception it represents. Return JSON with exactly three fields.
believe: state the belief they hold, in second person, in one sentence, charitably - no mockery.
wrong: the single clearest reason it is false. Prefer one concrete, checkable fact over a general argument.
actual: the correct model in two sentences, phrased so it explains the same observation their wrong belief was trying to explain.
Never exceed two sentences per field. Never add caveats or encouragement. Never mention that you are an AI.`;

/** Kept as a named export because the first attempt's prompt is unchanged. */
export const REFUTE_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;

/**
 * What to do with the learner's own words when there are some.
 *
 * Two instructions carry the weight. Use the material's wording, because a correction
 * phrased in the vocabulary of the notes is a correction the learner can take back to
 * the notes. And do not quote it, because the app quotes it: the sourceNote under the
 * card is a span the app matched, so a model paraphrase of the same sentence would sit
 * above it reading like a second, slightly different source.
 *
 * Where the extract and the model disagree, the extract wins. That is a real cost and
 * it is the right way round: the learner is being examined on these notes, the
 * questions were written from them, and an explanation that quietly corrects the
 * syllabus leaves them with an answer that will be marked wrong.
 */
const GROUNDED_DIRECTIVE = `The MATERIAL line is an extract from the learner's own notes, which is the source the question was written from. Use its wording and its numbers in the wrong and actual fields, and do not contradict it: where it disagrees with what you know, it is what the learner is being examined on. If it does not settle the question, answer from what you know and leave it alone. Never quote it back and never mention that you were given it.`;

/**
 * The prompt for one attempt.
 *
 * A later style adds a directive rather than replacing the prompt, so every
 * explanation the learner reads has the same three fields and the same limits. What
 * changes is the route the explanation takes, which is the only thing worth changing
 * when the previous wording has already failed.
 */
export function refuteSystemPrompt(style: Style, grounded = false): string {
  const parts = [BASE_SYSTEM_PROMPT];
  const directive = STYLE_DIRECTIVE[style];
  if (directive) parts.push(directive);
  if (grounded) parts.push(GROUNDED_DIRECTIVE);
  return parts.join("\n");
}

/**
 * The question, with the learner's material above it when there is any.
 *
 * The extract goes first because everything under it is the thing being asked about
 * and the extract is what the answer has to be built from. It is one passage rather
 * than three: the shortlist exists so the re-rank has something to choose between,
 * and once it has chosen, sending the runners-up would only offer the model a second
 * source to blend in.
 */
export function refuteUserPrompt(
  req: RefuteRequest,
  passage: string | null = null,
): string {
  const lines = passage ? [`MATERIAL: ${passage}`] : [];
  lines.push(
    `Question: ${req.stem}`,
    `The option they chose: ${req.chosenOptionText}`,
    `The misconception this represents: ${req.misconception}`,
    `The correct option: ${req.correctOptionText}`,
  );
  return lines.join("\n");
}

/** Everything the route needs, plus the material retrieval reads and never sends. */
export interface RefuteBodyInput extends Omit<RefuteRequest, "candidates"> {
  /** The learner's notes, when the pack was written from an upload. */
  material?: string;
}

/**
 * The request body, retrieval included.
 *
 * Both call sites go through here so a first attempt and an escalated one are grounded
 * the same way. It has to be one function rather than two similar blocks: the passage
 * quoted under the card is whichever one this chose, so a second copy of the logic
 * would eventually cite a different sentence for the same belief.
 *
 * Stringify the returned object as it is. fitCandidates measured this exact shape,
 * with candidates last, against the route's 4KB cap, so adding a field afterwards
 * spends a budget that has already been counted.
 */
export function refuteBody(input: RefuteBodyInput): RefuteRequest {
  const { material, ...base } = input;
  const found = material ? retrieve(material, retrievalQuery(base)) : [];
  return { ...base, candidates: fitCandidates(base, found, MAX_BODY_BYTES) };
}
