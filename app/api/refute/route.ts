import { NextResponse } from "next/server";
import { chatJson, hasKey } from "@/lib/mistral";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  MAX_BODY_BYTES,
  REFUTE_SYSTEM_PROMPT,
  parseRefutation,
  parseRefuteRequest,
  refuteUserPrompt,
} from "@/lib/refutation";
import type { Refutation } from "@/lib/types";

export const runtime = "nodejs";

const RATE_LIMIT_PER_MINUTE = 20;
const MAX_TOKENS = 400;

/** In-process cache keyed `${itemId}:${chosenOptionId}`. */
const cache = new Map<string, Refutation>();

/**
 * PUBLIC, UNAUTHENTICATED ENDPOINT THAT SPENDS MONEY.
 *
 * Every call that misses the cache triggers a paid Mistral completion. Guards:
 * a 4KB body cap, a hard max_tokens cap, a per-IP fixed-window rate limit of 20
 * requests/minute returning 429, and an in-process cache. The API key is read
 * server-side from process.env only and is never sent to the client.
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

  const key = `${req.itemId}:${req.chosenOptionId}`;
  const cached = cache.get(key);
  if (cached) {
    return NextResponse.json({ refutation: cached, source: "cache" });
  }

  // Any failure path returns 200 with the hand-written fallback so the UI never breaks.
  if (!hasKey()) {
    return NextResponse.json({
      refutation: req.fallbackRefutation,
      source: "fallback",
    });
  }

  try {
    const json = await chatJson(
      [
        { role: "system", content: REFUTE_SYSTEM_PROMPT },
        { role: "user", content: refuteUserPrompt(req) },
      ],
      { maxTokens: MAX_TOKENS, timeoutMs: 12_000 },
    );
    const refutation = parseRefutation(json);
    if (!refutation) throw new Error("shape validation failed");
    cache.set(key, refutation);
    return NextResponse.json({ refutation, source: "model" });
  } catch {
    return NextResponse.json({
      refutation: req.fallbackRefutation,
      source: "fallback",
    });
  }
}
