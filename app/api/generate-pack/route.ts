import { NextResponse } from "next/server";
import {
  GENERATE_SYSTEM_PROMPT,
  MAX_UPLOAD_BYTES,
  MIN_MATERIAL_CHARS,
  assembleItem,
  clampItemCount,
  clean,
  generateUserPrompt,
  parseGeneratedItem,
  slugify,
  trimMaterial,
} from "@/lib/custom-pack";
import { chatJson, hasKey, ocrDocument } from "@/lib/mistral";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { Item, Pack } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Tighter than the other routes: one call here fans out into several model calls. */
const RATE_LIMIT_PER_MINUTE = 5;
const MAX_TOKENS_PER_ITEM = 700;
const MAX_TEXT_BODY_BYTES = 200 * 1024;
/**
 * A pack ships if at least this many questions survive validation, even when the
 * learner asked for more. A 3B model drops the odd malformed item, and three
 * good questions beat a 502.
 */
const MIN_ITEMS_KEPT = 3;

/**
 * PUBLIC, UNAUTHENTICATED ENDPOINT THAT SPENDS MONEY.
 *
 * One request runs an OCR pass over an uploaded PDF and then one paid completion
 * per question. Guards: an 8MB upload cap, a 200KB cap on pasted text, material
 * truncated before it reaches the model, a hard max_tokens per item, a hard cap on
 * the number of items, and a per-IP fixed-window limit of 5 requests/minute
 * returning 429. The API key is read server-side from process.env only and is
 * never sent to the client. Uploaded files are deleted from Mistral after OCR.
 */
export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit(clientIp(request.headers), RATE_LIMIT_PER_MINUTE);
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
          "Question generation needs MISTRAL_API_KEY on the server. The three built-in packs work without it.",
      },
      { status: 503 },
    );
  }

  let material = "";
  let title = "";
  let sourceName = "";
  let count = 6;

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      title = clean(form.get("title"), 80) ?? "";
      count = clampItemCount(form.get("count"));

      if (file instanceof File) {
        if (file.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json(
            { error: "That file is over 8MB. Trim it or paste the text instead." },
            { status: 413 },
          );
        }
        sourceName = file.name;
        const isPdf =
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf");
        material = isPdf
          ? await ocrDocument(file, file.name)
          : await file.text();
      }

      const pasted = clean(form.get("text"), 200_000);
      if (!material && pasted) material = pasted;
    } else {
      const raw = await request.text();
      if (raw.length > MAX_TEXT_BODY_BYTES) {
        return NextResponse.json(
          { error: "That is a lot of text. Keep it under 200KB." },
          { status: 413 },
        );
      }
      const body = JSON.parse(raw) as Record<string, unknown>;
      material = typeof body.text === "string" ? body.text : "";
      title = clean(body.title, 80) ?? "";
      sourceName = clean(body.sourceName, 120) ?? "";
      count = clampItemCount(body.count);
    }
  } catch {
    return NextResponse.json(
      { error: "Could not read that material. Try a PDF, a .txt file, or paste text." },
      { status: 400 },
    );
  }

  material = trimMaterial(material);
  if (material.length < MIN_MATERIAL_CHARS) {
    return NextResponse.json(
      {
        error: `There is not enough readable text in that (${material.length} characters). Scanned images without text will not work.`,
      },
      { status: 422 },
    );
  }

  const packTitle = title || sourceName.replace(/\.[a-z0-9]+$/i, "") || "Your material";
  const packId = `custom-${slugify(packTitle, "pack")}-${Date.now().toString(36)}`;

  // One completion per question, sequential so each prompt can steer the next
  // away from concepts already covered. A few spare attempts cover the questions
  // a small model returns malformed.
  const items: Item[] = [];
  const usedConcepts: string[] = [];
  const usedKeys = new Set<string>();
  const maxAttempts = count + 3;

  for (
    let attempt = 0;
    attempt < maxAttempts && items.length < count;
    attempt += 1
  ) {
    try {
      const raw = await chatJson(
        [
          { role: "system", content: GENERATE_SYSTEM_PROMPT },
          {
            role: "user",
            content: generateUserPrompt(
              material,
              items.length + 1,
              count,
              usedConcepts,
            ),
          },
        ],
        { maxTokens: MAX_TOKENS_PER_ITEM, timeoutMs: 20_000, temperature: 0.4 },
      );

      const generated = parseGeneratedItem(raw);
      if (!generated) continue;
      if (usedKeys.has(generated.topic.toLowerCase())) continue;

      items.push(assembleItem(generated, packId, items.length));
      usedConcepts.push(generated.topic);
      usedKeys.add(generated.topic.toLowerCase());
    } catch {
      // A single failed or malformed question does not sink the pack.
      continue;
    }
  }

  if (items.length < MIN_ITEMS_KEPT) {
    return NextResponse.json(
      {
        error: `Only ${items.length} usable question${items.length === 1 ? "" : "s"} came back. Try material with more explaining in it, or fewer questions.`,
      },
      { status: 502 },
    );
  }

  const pack: Pack = {
    id: packId,
    title: packTitle,
    blurb: `${items.length} questions generated from your own material.`,
    items,
    origin: "custom",
    createdAt: Date.now(),
    sourceName: sourceName || undefined,
  };

  return NextResponse.json({ pack });
}
