import { NextResponse } from "next/server";
import { chatJson, hasKey, transcribe } from "@/lib/mistral";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RATE_LIMIT_PER_MINUTE = 20;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // 4MB of audio, ~ several minutes of speech
const MAX_OPTIONS_BYTES = 4 * 1024;

interface Choice {
  id: string;
  text: string;
}

/**
 * PUBLIC, UNAUTHENTICATED ENDPOINT THAT SPENDS MONEY.
 *
 * Speech-to-text via Mistral Voxtral, plus an optional Ministral 3B pass that maps
 * the transcript onto one of the answer options. Guards: 4MB audio cap, 4KB cap on
 * the options field, per-IP limit of 20 requests/minute returning 429. Failures
 * return 200 with an empty transcript so the UI degrades to tapping. The API key
 * stays server-side.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limit = rateLimit(
    `transcribe:${clientIp(request.headers)}`,
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

  if (!hasKey()) {
    return NextResponse.json({ text: "", matchedOptionId: null, source: "disabled" });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "missing_audio" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const rawOptions = form.get("options");
  let choices: Choice[] = [];
  if (typeof rawOptions === "string") {
    if (new TextEncoder().encode(rawOptions).byteLength > MAX_OPTIONS_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    choices = parseChoices(rawOptions);
  }

  let text = "";
  try {
    text = await transcribe(file, filenameFor(file));
  } catch {
    return NextResponse.json({ text: "", matchedOptionId: null, source: "error" });
  }

  let matchedOptionId: string | null = null;
  if (text && choices.length > 0) {
    matchedOptionId = await matchOption(text, choices);
  }

  return NextResponse.json({ text, matchedOptionId, source: "model" });
}

function filenameFor(file: Blob): string {
  const type = file.type || "audio/webm";
  if (type.includes("mp4") || type.includes("m4a")) return "answer.mp4";
  if (type.includes("ogg")) return "answer.ogg";
  if (type.includes("mpeg")) return "answer.mp3";
  if (type.includes("wav")) return "answer.wav";
  return "answer.webm";
}

function parseChoices(raw: string): Choice[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c): c is Choice =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as Choice).id === "string" &&
          typeof (c as Choice).text === "string",
      )
      .slice(0, 8)
      .map((c) => ({ id: c.id.slice(0, 40), text: c.text.slice(0, 300) }));
  } catch {
    return [];
  }
}

/** Ministral 3B picks the option the spoken answer refers to, or null. */
async function matchOption(
  text: string,
  choices: Choice[],
): Promise<string | null> {
  const list = choices.map((c) => `${c.id}: ${c.text}`).join("\n");
  try {
    const json = (await chatJson(
      [
        {
          role: "system",
          content:
            'You map a spoken answer onto one of the labelled options. Return JSON {"id": "<option id>"} for the option the speaker means, or {"id": null} if no option clearly matches. The speaker may say the option letter, or paraphrase the option text. Return nothing else.',
        },
        { role: "user", content: `Options:\n${list}\n\nSpoken answer: ${text}` },
      ],
      { maxTokens: 40, timeoutMs: 8_000, temperature: 0 },
    )) as { id?: unknown };
    const id = typeof json.id === "string" ? json.id.trim() : null;
    return choices.some((c) => c.id === id) ? id : null;
  } catch {
    return null;
  }
}
