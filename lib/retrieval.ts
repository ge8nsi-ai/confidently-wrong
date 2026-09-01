/**
 * Finding the part of the learner's own material that speaks to a wrong answer.
 *
 * The generator already grounds every question it writes. lib/grounding.ts makes the
 * model quote the span of the source that settles the question, locates that span in
 * the material by string matching, and ships the verified quote as the item's
 * sourceNote. None of that reaches the repair round. /api/refute is handed a stem, an
 * option and a misconception and nothing else, so the explanation of why a belief is
 * wrong is written from whatever the model already knows rather than from the notes
 * the learner is being examined on. Where the two disagree, the learner is told their
 * own material is wrong, in a paragraph that cannot cite it.
 *
 * So the passage is retrieved and sent with the request. Retrieval runs in the
 * browser, because that is the only place the material lives: nothing is stored
 * server-side, and the request body is capped at 4KB, so the document cannot be
 * posted whole and the few passages worth reading have to be chosen before the call.
 *
 * Two stages, split by what each one costs. Lexical BM25 is free, so it runs over
 * every passage, which is what a first pass has to do. Embeddings cost a call, so they
 * only ever see a shortlist, and all they do with it is reorder: which of three
 * passages settles the question, never whether the material covers it. The lexical
 * winner is kept either way, so a re-rank that fails costs the ordering and not the
 * citation.
 */

import { sharedContentWords, wordsOf } from "./grounding";
import { cosine } from "./similarity";

/**
 * How long a passage should be.
 *
 * It has two jobs and they pull against each other. It is context for the model,
 * which wants the sentences around the one that matters, and it is a quote shown to
 * the learner, which wants one sentence. About 420 characters is two or three: enough
 * for a correction to lean on, short enough to read as a citation rather than a page.
 */
export const TARGET_PASSAGE_CHARS = 420;

/** No passage exceeds this, so what one candidate costs on the wire is known. */
export const MAX_PASSAGE_CHARS = 520;

/**
 * Below this, a passage is not left standing on its own. A markdown heading is its
 * own paragraph and means nothing without the text under it, and "See figure 3." is
 * not a citation of anything.
 */
export const MIN_PASSAGE_CHARS = 80;

/**
 * Candidates sent for re-ranking.
 *
 * Three is a ceiling and not a target. Most of the 4KB body is already spoken for by
 * the question, the option, the misconception and the hand-written fallback, so
 * fitCandidates drops from the end until what is left is a body the route accepts.
 */
export const MAX_CANDIDATES = 3;

/**
 * Characters of query kept.
 *
 * The embeddings endpoint truncates its input at 600 characters without saying so, so
 * the cut is made here where it can be made on a word boundary and where the order of
 * the query decides what survives it.
 */
export const MAX_QUERY_CHARS = 500;

/**
 * Content words a passage has to share with the query to be a candidate at all.
 *
 * A positive BM25 score only means one query term appears somewhere, and "water"
 * appearing in a document about water is not a reason to quote a paragraph at
 * someone. Two is stricter than the one word lib/grounding.ts asks of a
 * model-located span, and it can afford to be: that check is adjudicating a citation
 * the model already committed to, this one is choosing among thirty passages and can
 * always take the next.
 */
export const MIN_SHARED_WITH_QUERY = 2;

/**
 * BM25 at the parameters everybody else measured.
 *
 * Not tuned, and deliberately not. Tuning k1 and b needs a labelled set of question
 * and right-passage pairs from real uploads, which does not exist here, and numbers
 * picked to look tuned are worse than the defaults, because they cannot be checked.
 */
const K1 = 1.2;
const B = 0.75;

/** Paragraphs, in order, with the line breaks inside one folded to spaces. */
function blocks(material: string): string[] {
  return material
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const TERMINATORS = new Set([".", "!", "?"]);
const CLOSERS = new Set(['"', "'", "”", "’", ")", "]", "»"]);

/**
 * Sentences, by scanning rather than by a lookbehind regex, since this project
 * targets ES2017.
 *
 * A terminator only ends a sentence when a space follows it, which is what keeps
 * "12.5 metres" and "0.5" in one piece: the number checks in lib/grounding.ts read
 * these passages later and half a figure is a different figure. "e.g. the ocean" does
 * split, and that costs a passage boundary in an odd place and nothing else.
 */
function sentences(block: string): string[] {
  const out: string[] = [];
  let start = 0;

  for (let i = 0; i < block.length; i += 1) {
    if (!TERMINATORS.has(block[i]!)) continue;
    // Run past a repeated terminator and any quote or bracket closing after it, so
    // the sentence keeps its own punctuation.
    let end = i + 1;
    while (
      end < block.length &&
      (TERMINATORS.has(block[end]!) || CLOSERS.has(block[end]!))
    ) {
      end += 1;
    }
    if (end < block.length && block[end] !== " ") continue;

    const piece = block.slice(start, end).trim();
    if (piece) out.push(piece);
    start = end;
    i = end - 1;
  }

  const tail = block.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** A sentence longer than one passage, cut on word boundaries. */
function splitLong(sentence: string): string[] {
  if (sentence.length <= MAX_PASSAGE_CHARS) return [sentence];

  const out: string[] = [];
  let current = "";
  for (const raw of sentence.split(" ")) {
    // A single token past the cap is a URL or a base64 blob rather than a word. It is
    // cut instead of being allowed to break the one invariant a passage has.
    const word =
      raw.length > MAX_PASSAGE_CHARS ? raw.slice(0, MAX_PASSAGE_CHARS) : raw;
    if (current && current.length + 1 + word.length > MAX_PASSAGE_CHARS) {
      out.push(current);
      current = "";
    }
    current = current ? `${current} ${word}` : word;
    if (current.length >= MAX_PASSAGE_CHARS) {
      out.push(current);
      current = "";
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * The material as passages of about TARGET_PASSAGE_CHARS, in document order.
 *
 * Paragraph first, then sentence, then word: the break is taken at the coarsest
 * boundary that fits, because a passage quoted back to the learner as their own words
 * has to start where a sentence starts. A paragraph boundary only ends a passage once
 * there is something in it, which is what keeps a heading attached to the text it
 * introduces rather than becoming a candidate that cites a title.
 */
export function passages(material: string): string[] {
  const out: string[] = [];
  let current = "";

  const flush = () => {
    if (current) out.push(current);
    current = "";
  };

  const add = (piece: string) => {
    if (current && current.length + 1 + piece.length > MAX_PASSAGE_CHARS) flush();
    current = current ? `${current} ${piece}` : piece;
    if (current.length >= TARGET_PASSAGE_CHARS) flush();
  };

  for (const block of blocks(material)) {
    if (current.length >= MIN_PASSAGE_CHARS) flush();
    for (const sentence of sentences(block)) {
      for (const piece of splitLong(sentence)) add(piece);
    }
  }
  flush();

  // The end of the document is the one break that cannot be declined, so a short tail
  // is folded back into the passage before it rather than left to be quoted alone.
  const last = out.length - 1;
  if (last > 0 && out[last]!.length < MIN_PASSAGE_CHARS) {
    const merged = `${out[last - 1]} ${out[last]}`;
    if (merged.length <= MAX_PASSAGE_CHARS) out.splice(last - 1, 2, merged);
  }

  return out;
}

interface Scored {
  index: number;
  score: number;
}

/**
 * BM25 scores for every passage against the query, best first, zeroes dropped.
 *
 * Query terms are deduplicated, so a stem that says "tide" four times does not get
 * four votes: what is being asked is which passage is about the question, not how
 * emphatically the question was worded.
 *
 * The IDF is the smoothed form, log(1 + (N - df + 0.5) / (df + 0.5)), and not the
 * textbook one. Over the twenty or thirty passages a 12,000-character upload makes,
 * the textbook form goes negative for any term appearing in more than half of them,
 * which scores a passage down for containing the word the question is about. The
 * smoothed form stays positive and decays to almost nothing instead, which is also
 * why there is no stopword list here: a term in every passage is already worth about
 * a fiftieth of a term in three.
 */
export function scorePassages(query: string, list: string[]): Scored[] {
  const docs = list.map(wordsOf);
  const total = docs.length;
  if (total === 0) return [];

  const lengths = docs.map((doc) => doc.length);
  const average = lengths.reduce((sum, n) => sum + n, 0) / total || 1;

  const counts = docs.map((doc) => {
    const map = new Map<string, number>();
    for (const word of doc) map.set(word, (map.get(word) ?? 0) + 1);
    return map;
  });

  const wanted = [...new Set(wordsOf(query))];
  const idf = new Map<string, number>();
  for (const word of wanted) {
    const df = counts.filter((count) => count.has(word)).length;
    idf.set(word, Math.log(1 + (total - df + 0.5) / (df + 0.5)));
  }

  return docs
    .map((_, index) => {
      let score = 0;
      for (const word of wanted) {
        const tf = counts[index]!.get(word) ?? 0;
        if (tf === 0) continue;
        const norm = tf + K1 * (1 - B + (B * lengths[index]!) / average);
        score += ((idf.get(word) ?? 0) * tf * (K1 + 1)) / norm;
      }
      return { index, score };
    })
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

/**
 * What retrieval is looking for.
 *
 * The belief first, then the answer that displaces it, then the question. That order
 * is a truncation policy rather than an emphasis: the stem is the longest of the three
 * and the one padded with question wording, so it is the part to lose when the cut
 * comes. Both stages build the query through this function, the browser for the free
 * pass and the route for the paid one, because re-ranking a shortlist against a
 * different question than the one that produced it is worse than not re-ranking.
 */
export function retrievalQuery(parts: {
  stem: string;
  misconception: string;
  correctOptionText: string;
}): string {
  const query = [parts.misconception, parts.correctOptionText, parts.stem]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  if (query.length <= MAX_QUERY_CHARS) return query;
  const cut = query.slice(0, MAX_QUERY_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}

/**
 * The passages worth sending, best first.
 *
 * The shared-word floor is what makes a miss look like a miss. BM25 ranks every
 * passage against any query at all, and the top of a ranking over material that never
 * discusses the question is still a passage, which would then be quoted as though it
 * settled something. Requiring MIN_SHARED_WITH_QUERY content words is a floor the
 * ranking cannot argue its way past, so material that does not cover the question
 * yields nothing rather than yielding its least irrelevant paragraph.
 *
 * Passages under MIN_PASSAGE_CHARS are dropped here rather than in passages(), which
 * has to keep document order intact and cannot know what will be quoted.
 */
export function retrieve(
  material: string,
  query: string,
  max: number = MAX_CANDIDATES,
): string[] {
  if (!material.trim() || !query.trim() || max <= 0) return [];

  const list = passages(material);
  const out: string[] = [];
  for (const scored of scorePassages(query, list)) {
    if (out.length >= max) break;
    const passage = list[scored.index]!;
    if (passage.length < MIN_PASSAGE_CHARS) continue;
    if (sharedContentWords(query, passage) < MIN_SHARED_WITH_QUERY) continue;
    out.push(passage);
  }
  return out;
}

/** What the route will measure, measured the same way: bytes, not characters. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * The candidates that still fit inside the request the route will accept.
 *
 * The 4KB cap on /api/refute is a security control and stays where it is, so the
 * passages have to be fitted to it rather than the other way around. The trial object
 * is the object that gets sent, serialised the same way and measured in bytes rather
 * than characters, so there is no margin to guess at: a curly quote is three bytes in
 * both places or the check is worthless.
 *
 * Candidates are dropped from the end, which is the cheapest thing to lose. The last
 * candidate is the one BM25 ranked third; the first is the one that gets quoted if the
 * re-rank never happens. So a long stem and a long misconception cost the learner a
 * better ordering, and never the citation itself.
 */
export function fitCandidates<T extends object>(
  body: T,
  candidates: string[],
  budgetBytes: number,
): string[] {
  let kept = candidates.slice(0, MAX_CANDIDATES);
  while (kept.length > 0) {
    const trial = JSON.stringify({ ...body, candidates: kept });
    if (byteLength(trial) <= budgetBytes) break;
    kept = kept.slice(0, kept.length - 1);
  }
  return kept;
}

/**
 * The candidate an embedding model thinks is closest to the query, or null.
 *
 * `vectors` is exactly what embedding [query, ...candidates] in one call returns, so
 * the query is at 0 and candidate i is at i + 1. Splitting it here rather than at the
 * call site keeps the off-by-one in one tested place.
 *
 * This reorders a shortlist and nothing more. It is deliberately not a relevance test:
 * lib/similarity.ts measured mistral-embed putting unrelated questions around 0.72
 * rather than near 0, so a cosine cannot say whether the material covers the question
 * at all. That judgement stays with the shared-word floor in retrieve(), and what is
 * left for embeddings is the case BM25 gets wrong: the passage that settles the
 * question in the question's own vocabulary, ranked second because a longer passage
 * repeated one of its words more often.
 *
 * It answers null rather than guessing when the reply is unusable, and the caller
 * keeps the lexical winner. A tie leaves the BM25 order standing, since the comparison
 * is strictly greater than.
 */
export function rerank(candidates: string[], vectors: number[][]): string | null {
  if (candidates.length === 0) return null;
  // A reply of the wrong length is a reply about different texts than these.
  if (vectors.length !== candidates.length + 1) return null;

  const query = vectors[0]!;
  let bestAt = -1;
  let best = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const score = cosine(query, vectors[i + 1]!);
    if (score > best) {
      best = score;
      bestAt = i;
    }
  }

  return bestAt === -1 ? null : candidates[bestAt]!;
}
