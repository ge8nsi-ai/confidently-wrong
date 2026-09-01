/**
 * Explain-it-out-loud mode: prompts, validation, and the bridge to a quiz.
 *
 * The learner explains a topic in their own words. Ministral 3B returns a flat
 * critique: what was right, what was missing, and each wrong claim paired with a
 * correction. That critique is then turned into quiz material by hand, in
 * `quizMaterial`, which keeps the learner's wrong claims strictly in a
 * misconceptions section. The question writer may only draw correct answers from
 * the facts section, so a quiz can never end up teaching back the learner's own
 * error as if it were true.
 */

import { clean } from "./custom-pack";

/** A spoken explanation is capped before it reaches the model. */
export const MAX_TRANSCRIPT_CHARS = 6_000;
/** Below this there is nothing to critique. */
export const MIN_TRANSCRIPT_CHARS = 80;

export interface CritiqueError {
  /** The learner's claim, quoted back in their own terms. */
  claim: string;
  why: string;
  correction: string;
}

export interface Critique {
  topic: string;
  verdict: string;
  right: string[];
  gaps: string[];
  errors: CritiqueError[];
}

export const EXPLAIN_SYSTEM_PROMPT = `You listen to a learner explain a topic from memory and mark the explanation honestly.

Reply with JSON only, in exactly this shape:
{"topic":"Short label for what they explained","verdict":"One sentence on how sound the explanation was overall","right":["A point they got right, stated as a fact"],"gaps":["Something important they left out, stated as the fact they omitted"],"errors":[{"claim":"What they claimed, in their terms","why":"Why that is wrong, one concrete sentence","correction":"What is actually true, one or two short sentences"}]}

Rules:
- Judge only what they said. Do not invent claims they did not make.
- A point belongs in "right" only if they actually stated it. If they stated the opposite, it is an error, not a right point.
- Every entry in "right" and "gaps" must be a true statement of the subject matter, not a comment about the learner. Write "Memory cells make the second response faster", never "They did not mention memory cells".
- List at most four entries per array. Use an empty array when there is nothing to report.
- An error goes in "errors" only if they actually asserted it. Something merely unmentioned is a gap, not an error.
- Plain text only. No markdown, no asterisks, no bullets, no numbering.
- Never praise or scold. State facts.`;

export function explainUserPrompt(topic: string, transcript: string): string {
  const named = topic.trim().length > 0 ? topic.trim() : "not stated";
  return `TOPIC THE LEARNER NAMED: ${named}

THEIR EXPLANATION, TRANSCRIBED FROM SPEECH:
${transcript}

Mark it.`;
}

/** Validates one model-produced critique. Returns null rather than throwing. */
export function parseCritique(value: unknown, fallbackTopic = ""): Critique | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  const topic = clean(raw.topic, 80) ?? clean(fallbackTopic, 80);
  const verdict = clean(raw.verdict, 300);
  if (!topic || !verdict) return null;

  const right = parseStatements(raw.right);
  const gaps = parseStatements(raw.gaps);
  const errors = parseErrors(raw.errors);

  // A critique with nothing in any bucket tells the learner nothing.
  if (right.length === 0 && gaps.length === 0 && errors.length === 0) return null;

  return { topic, verdict, right, gaps, errors };
}

function parseStatements(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const text = clean(entry, 300);
    if (!text || text.length < 8) continue;
    if (isCommentary(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === 4) break;
  }
  return out;
}

/**
 * Drops entries that talk about the learner instead of the subject. A gap phrased
 * as "the learner did not mention X" is useless as quiz material, because the
 * question writer would treat it as a fact about the world.
 */
function isCommentary(text: string): boolean {
  return /\b(?:the learner|the speaker|the explanation|you (?:did not|didn't|failed|never|omitted|forgot)|they (?:did not|didn't|never|omitted|forgot))\b/i.test(
    text,
  );
}

function parseErrors(value: unknown): CritiqueError[] {
  if (!Array.isArray(value)) return [];
  const out: CritiqueError[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    const claim = clean(raw.claim, 300);
    const why = clean(raw.why, 300);
    const correction = clean(raw.correction, 400);
    if (!claim || !why || !correction) continue;
    // A one-word "correction" is the model padding the shape, not a correction.
    if (correction.length < 12) continue;
    const key = claim.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ claim, why, correction });
    if (out.length === 4) break;
  }
  return out;
}

/**
 * Turns a critique into material for the question writer.
 *
 * Facts and misconceptions are kept in separate labelled sections, and the
 * learner's raw words are left out entirely. Corrections and gaps therefore
 * become the correct answers, and the claims the learner actually got wrong
 * become the distractors they are most likely to fall for.
 */
export function quizMaterial(critique: Critique): string {
  const facts = [
    ...critique.errors.map((e) => e.correction),
    ...critique.gaps,
    ...critique.right,
  ];
  const lines = [
    `TOPIC: ${critique.topic}`,
    "",
    "ESTABLISHED FACTS. Only these may be used as correct answers:",
    ...facts.map((f) => `- ${f}`),
  ];

  if (critique.errors.length > 0) {
    lines.push(
      "",
      "MISCONCEPTIONS THIS LEARNER HOLDS. Use these as wrong answers, never as correct ones:",
      ...critique.errors.map((e) => `- ${e.claim} (wrong because ${lowerFirst(e.why)})`),
    );
  }

  return lines.join("\n");
}

/** The critique as one block of prose, for read-aloud. */
export function spokenCritique(critique: Critique): string {
  const parts = [critique.verdict];
  if (critique.right.length > 0) {
    parts.push(`You had this right. ${critique.right.join(" ")}`);
  }
  if (critique.errors.length > 0) {
    parts.push(
      `Now the errors. ${critique.errors
        .map((e) => `You said ${lowerFirst(e.claim)} ${e.why} ${e.correction}`)
        .join(" ")}`,
    );
  }
  if (critique.gaps.length > 0) {
    parts.push(`You left this out. ${critique.gaps.join(" ")}`);
  }
  return parts.join(" ");
}

function lowerFirst(text: string): string {
  // Only lowers a leading function word, so "Earth" and other proper nouns and
  // acronyms survive being spliced into the middle of a sentence.
  const match = /^(The|They|It|Its|This|That|These|Those|A|An|We|You|Your|There|Their|His|Her|Some|Most|All|Both|When|If|Because|Since|As)\b/.exec(
    text,
  );
  if (!match) return text;
  return text[0]!.toLowerCase() + text.slice(1);
}

/** Caps a transcript before it reaches the model, on a sentence boundary. */
export function trimTranscript(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_TRANSCRIPT_CHARS) return collapsed;
  const cut = collapsed.slice(0, MAX_TRANSCRIPT_CHARS);
  const lastStop = cut.lastIndexOf(". ");
  return lastStop > MAX_TRANSCRIPT_CHARS / 2 ? cut.slice(0, lastStop + 1) : cut;
}
