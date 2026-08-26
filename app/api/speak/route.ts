import { NextResponse } from "next/server";
import { hasKey, speak } from "@/lib/mistral";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RATE_LIMIT_PER_MINUTE = 20;
const MAX_BODY_BYTES = 4 * 1024;
const MAX_INPUT_CHARS = 1_200;

/** In-process cache of synthesised audio, keyed by voice + text. */
const cache = new Map<string, Uint8Array>();

/**
 * PUBLIC, UNAUTHENTICATED ENDPOINT THAT SPENDS MONEY.
 *
 * Text-to-speech via Mistral Voxtral. Guards: 4KB body cap, 1,200-character input
 * cap, per-IP limit of 20 requests/minute returning 429, and an in-process audio
 * cache. On any failure it returns 204 so the client can fall back to the browser's
 * built-in speech synthesis. The API key stays server-side.
 */
export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit(
    `speak:${clientIp(request.headers)}`,
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

  let text: string;
  let voice: string | undefined;
  try {
    const body = JSON.parse(raw) as { text?: unknown; voice?: unknown };
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    text = body.text.trim().slice(0, MAX_INPUT_CHARS);
    voice = typeof body.voice === "string" ? body.voice.slice(0, 64) : undefined;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!hasKey()) return new Response(null, { status: 204 });

  const key = `${voice ?? "default"}:${text}`;
  const cached = cache.get(key);
  if (cached) return mp3(cached);

  try {
    const audio = await speak(text, { voice });
    if (cache.size > 60) cache.clear();
    cache.set(key, audio);
    return mp3(audio);
  } catch {
    // 204: no audio available, client falls back to on-device speech.
    return new Response(null, { status: 204 });
  }
}

function mp3(bytes: Uint8Array): Response {
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(bytes.byteLength),
    },
  });
}
