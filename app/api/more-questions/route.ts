import { NextResponse } from "next/server";
import { MIN_MATERIAL_CHARS, clean, slugify, trimMaterial } from "@/lib/custom-pack";
import { BATCH, MAX_TARGET } from "@/lib/endless";
import { generateItems } from "@/lib/generate";
import { hasKey } from "@/lib/mistral";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
/** A batch is three questions, so it finishes well inside the Hobby 60s cap. */
export const maxDuration = 60;

/**
 * Tighter than the pack route, because endless mode calls this one repeatedly.
 *
 * Eight batches a minute at three questions each is twenty-four questions a
 * minute, which nobody answers, so this bounds the spend without ever being what
 * stops a real learner.
 */
const RATE_LIMIT_PER_MINUTE = 8;
const MAX_BODY_BYTES = 200 * 1024;

/** Enough context to avoid repeats without letting the prompt grow unbounded. */
const MAX_AVOID = MAX_TARGET;

interface Avoid {
  topic: string;
  stem: string;
}

function parseAvoid(value: unknown): Avoid[] {
  if (!Array.isArray(value)) return [];
  const out: Avoid[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    const topic = clean(raw.topic, 120);
    const stem = clean(raw.stem, 300);
    if (topic && stem) out.push({ topic, stem });
    if (out.length === MAX_AVOID) break;
  }
  return out;
}

/**
 * PUBLIC, UNAUTHENTICATED ENDPOINT THAT SPENDS MONEY.
 *
 * One request writes up to three questions, each costing up to four paid Mistral
 * calls: one to write it, one to embed its stem, and two to verify it. Guards: a
 * 200KB body cap, material truncated before it reaches the model, a hard cap of
 * three questions per request, a hard max_tokens on every call, a capped
 * already-asked list so the prompt cannot grow without bound, a wall-clock budget
 * inside the generation loop, and a per-IP fixed-window limit of 8 requests/minute
 * returning 429. The client also stops asking at MAX_TARGET questions per run, but
 * that is a courtesy and this route does not rely on it. The API key is read
 * server-side from process.env only and is never sent to the client.
 */
export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit(
    `more:${clientIp(request.headers)}`,
    RATE_LIMIT_PER_MINUTE,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Slow down a moment — more questions are still coming." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (!hasKey()) {
    return NextResponse.json(
      { error: "More questions need MISTRAL_API_KEY on the server." },
      { status: 503 },
    );
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "That is too much text." }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const material = trimMaterial(typeof body.text === "string" ? body.text : "");
  if (material.length < MIN_MATERIAL_CHARS) {
    return NextResponse.json(
      { error: "There is not enough material left to write from." },
      { status: 422 },
    );
  }

  const asked = Number(body.count);
  const count = Math.min(
    BATCH,
    Math.max(1, Number.isFinite(asked) ? Math.round(asked) : BATCH),
  );
  const avoid = parseAvoid(body.avoid);
  const offset = Number(body.indexOffset);
  const indexOffset = Number.isFinite(offset)
    ? Math.max(0, Math.round(offset))
    : avoid.length;
  // The id prefix comes from the client so a batch's items belong to the pack they
  // are joining, but it is re-slugified here rather than trusted as a string.
  const packId = `custom-${slugify(clean(body.packId, 80) ?? "", "pack")}`;

  const { items, attempts, rejections } = await generateItems({
    material,
    count,
    packId,
    avoid,
    indexOffset,
    onWarn: (message) => console.warn(`more-questions: ${message}`),
  });

  // A batch that came back empty is not an error the learner can act on: they keep
  // answering what they have, and the next batch tries again. Reported as 200 with
  // an empty list so the client can tell "none this time" from "the route broke".
  if (items.length === 0) {
    console.warn(
      `more-questions: nothing usable after ${attempts} attempts — ${rejections
        .map((r) => r.stage)
        .join(", ")}`,
    );
  }

  return NextResponse.json({ items });
}
