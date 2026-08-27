import { NextResponse } from "next/server";
import { clean } from "@/lib/custom-pack";
import {
  EXPLAIN_SYSTEM_PROMPT,
  MIN_TRANSCRIPT_CHARS,
  explainUserPrompt,
  parseCritique,
  quizMaterial,
  trimTranscript,
} from "@/lib/explain";
import { chatJson, hasKey } from "@/lib/mistral";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT_PER_MINUTE = 10;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_TOKENS = 900;
/** One retry, because a malformed critique is worth one more cheap attempt. */
const MAX_ATTEMPTS = 2;

/**
 * PUBLIC, UNAUTHENTICATED ENDPOINT THAT SPENDS MONEY.
 *
 * Marks a spoken explanation: one paid completion per request, two at most when the
 * first reply is malformed. Guards: an 8KB body cap, the transcript truncated to
 * 6,000 characters before it reaches the model, a hard max_tokens, and a per-IP
 * fixed-window limit of 10 requests/minute returning 429. The API key is read
 * server-side from process.env only and is never sent to the client. Nothing is
 * stored: the transcript lives in the request and the reply only.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limit = rateLimit(
    `explain:${clientIp(request.headers)}`,
    RATE_LIMIT_PER_MINUTE,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (!hasKey()) {
    return NextResponse.json(
      {
        error:
          "Marking an explanation needs MISTRAL_API_KEY on the server. The three built-in packs work without it.",
      },
      { status: 503 },
    );
  }

  let transcript = "";
  let topic = "";
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "That explanation is very long. Keep it under a few minutes." },
        { status: 413 },
      );
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    transcript = typeof body.transcript === "string" ? body.transcript : "";
    topic = clean(body.topic, 80) ?? "";
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  transcript = trimTranscript(transcript);
  if (transcript.length < MIN_TRANSCRIPT_CHARS) {
    return NextResponse.json(
      {
        error: `There is not much to mark there (${transcript.length} characters). Explain it in a few more sentences.`,
      },
      { status: 422 },
    );
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const raw = await chatJson(
        [
          { role: "system", content: EXPLAIN_SYSTEM_PROMPT },
          { role: "user", content: explainUserPrompt(topic, transcript) },
        ],
        { maxTokens: MAX_TOKENS, timeoutMs: 25_000, temperature: 0.2 },
      );

      const critique = parseCritique(raw, topic);
      if (!critique) continue;

      return NextResponse.json({
        critique,
        quizMaterial: quizMaterial(critique),
      });
    } catch {
      // Fall through to the retry, then to the error below.
      continue;
    }
  }

  return NextResponse.json(
    { error: "The marking came back unusable. Try explaining it again." },
    { status: 502 },
  );
}
