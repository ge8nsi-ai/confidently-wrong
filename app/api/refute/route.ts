import { NextResponse } from "next/server";
import { sourceNoteFrom } from "@/lib/grounding";
import { chatJson, embed, hasKey } from "@/lib/mistral";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  MAX_BODY_BYTES,
  parseRefutation,
  parseRefuteRequest,
  refuteSystemPrompt,
  refuteUserPrompt,
} from "@/lib/refutation";
import { rerank, retrievalQuery } from "@/lib/retrieval";
import type { Refutation } from "@/lib/types";

export const runtime = "nodejs";

const RATE_LIMIT_PER_MINUTE = 20;
const MAX_TOKENS = 400;

/** Embeddings are one small call on a shortlist of three, so it gets a short leash. */
const RERANK_TIMEOUT_MS = 6_000;

/**
 * The passage the explanation gets built from.
 *
 * The client already ranked the material lexically, so candidates[0] is an answer
 * before this function does anything. Embeddings are asked only to reorder, and only
 * when there is something to reorder: one candidate skips the call, and a failure of
 * any kind keeps the lexical winner. That is the whole point of the two-stage split.
 * The paid call can improve the citation and cannot cost the learner one.
 */
async function choosePassage(
  query: string,
  candidates: string[],
): Promise<string | null> {
  const lexical = candidates[0] ?? null;
  if (!lexical || candidates.length === 1 || !hasKey()) return lexical;
  try {
    const vectors = await embed([query, ...candidates], {
      timeoutMs: RERANK_TIMEOUT_MS,
    });
    return rerank(candidates, vectors) ?? lexical;
  } catch {
    return lexical;
  }
}

/**
 * In-process cache keyed `${itemId}:${chosenOptionId}:${style}`.
 *
 * The style is part of the key because a second attempt on the same wrong answer is
 * meant to read differently. Leaving it out would serve the explanation that had
 * already failed, which is the one thing an escalation must not do.
 *
 * Grounded requests skip it in both directions. One Map serves every visitor to the
 * deployment, and a custom pack's ids come from its title, so two learners who both
 * paste notes called "Biology" share item ids without sharing a word of material. An
 * ungrounded refutation is the same text for both of them and safe to share; one built
 * from a passage of somebody else's upload is not. Nothing is lost by skipping it,
 * because the client keeps its own refutations in the store, and the packs that really
 * do share ids across visitors are the built-in ones, which have no material.
 */
const cache = new Map<string, Refutation>();

/**
 * PUBLIC, UNAUTHENTICATED ENDPOINT THAT SPENDS MONEY.
 *
 * Every call that misses the cache triggers a paid Mistral completion, and a grounded
 * call with more than one candidate passage adds a paid embedding call before it.
 * Guards: a 4KB body cap, a hard max_tokens cap, a per-IP fixed-window rate limit of
 * 20 requests/minute returning 429, an in-process cache for ungrounded calls, and a
 * cap of three candidate passages of 520 characters each enforced when the body is
 * parsed. The API key is read server-side from process.env only and is never sent to
 * the client.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limit = rateLimit(
    `refute:${clientIp(request.headers)}`,
    RATE_LIMIT_PER_MINUTE,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const req = parseRefuteRequest(parsedBody);
  if (!req) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const grounded = req.candidates.length > 0;
  const key = `${req.itemId}:${req.chosenOptionId}:${req.style}`;
  if (!grounded) {
    const cached = cache.get(key);
    if (cached) {
      return NextResponse.json({ refutation: cached, source: "cache" });
    }
  }

  const passage = grounded
    ? await choosePassage(retrievalQuery(req), req.candidates)
    : null;

  /**
   * The citation is the app's claim, not the model's.
   *
   * parseRefutation keeps three fields and drops the rest, so a reply cannot supply a
   * sourceNote of its own: the quote is the passage this route sent, formatted the same
   * way lib/grounding.ts formats the one under a generated question. It is attached to
   * the hand-written fallback too. That line does not claim the paragraph above it was
   * written from the quote, it says this is the part of your material that settles the
   * question, which stays true when the model call fails.
   */
  const withNote = (refutation: Refutation): Refutation =>
    passage ? { ...refutation, sourceNote: sourceNoteFrom(passage) } : refutation;

  /**
   * A second attempt has no fallback to fall back to.
   *
   * The hand-written fallback is the text the first attempt already showed, so
   * serving it here would put a "here is a different approach" label on the
   * explanation that is known to have failed. Reporting that no second explanation
   * is available is worse for the demo and true, and the client turns it into the
   * hand-off to a person rather than a retry.
   */
  const noSecondAttempt = req.style !== "direct";
  const giveUp = () =>
    NextResponse.json({ refutation: null, source: "unavailable" });

  // Any failure path returns 200 so the UI never breaks: with the hand-written
  // fallback on a first attempt, and with nothing at all on a later one.
  if (!hasKey()) {
    if (noSecondAttempt) return giveUp();
    return NextResponse.json({
      refutation: withNote(req.fallbackRefutation),
      source: "fallback",
    });
  }

  try {
    const json = await chatJson(
      [
        {
          role: "system",
          content: refuteSystemPrompt(req.style, passage !== null),
        },
        { role: "user", content: refuteUserPrompt(req, passage) },
      ],
      { maxTokens: MAX_TOKENS, timeoutMs: 12_000 },
    );
    const refutation = parseRefutation(json);
    if (!refutation) throw new Error("shape validation failed");
    if (!grounded) cache.set(key, refutation);
    return NextResponse.json({ refutation: withNote(refutation), source: "model" });
  } catch {
    if (noSecondAttempt) return giveUp();
    return NextResponse.json({
      refutation: withNote(req.fallbackRefutation),
      source: "fallback",
    });
  }
}
