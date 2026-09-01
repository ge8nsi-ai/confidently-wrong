import { NextResponse } from "next/server";
import {
  MAX_UPLOAD_BYTES,
  MIN_MATERIAL_CHARS,
  clampItemCount,
  clean,
  parseFocusList,
  slugify,
  trimMaterial,
} from "@/lib/custom-pack";
import { DEFAULT_TARGET, FIRST_BATCH, clampTarget } from "@/lib/endless";
import { MIN_ITEMS_KEPT, generateItems } from "@/lib/generate";
import { hasKey, ocrDocument } from "@/lib/mistral";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { Pack } from "@/lib/types";

export const runtime = "nodejs";
/**
 * Vercel Hobby caps a function at 60s. The eval in evals/report.md measures a
 * six-question pack at 27-38s, so lib/generate.ts watches the clock itself and
 * returns a short pack rather than being killed mid-call.
 */
export const maxDuration = 60;

/** Tighter than the other routes: one call here fans out into several model calls. */
const RATE_LIMIT_PER_MINUTE = 5;
const MAX_TEXT_BODY_BYTES = 200 * 1024;

/**
 * PUBLIC, UNAUTHENTICATED ENDPOINT THAT SPENDS MONEY.
 *
 * One request runs an OCR pass over an uploaded PDF and then up to four paid calls
 * per question: one to write it, one to embed its stem against the ones already
 * kept, and two to verify it: a blind re-answer and a citation from the source.
 * Guards: an 8MB upload cap, a 200KB cap on pasted text, material truncated before
 * it reaches the model, a hard max_tokens on every call, a hard cap on the number
 * of items, a wall-clock budget inside the loop, and a per-IP fixed-window limit of
 * 5 requests/minute returning 429. The API key is read server-side from
 * process.env only and is never sent to the client. Uploaded files are deleted from
 * Mistral after OCR.
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
  /** Points to build one question each around. Voice mode supplies these. */
  let focus: string[] = [];
  /**
   * Endless mode asks for a short first batch and keeps the material, so the
   * learner starts answering in a third of the time and the rest is written in the
   * background while they do.
   */
  let endless = false;
  let target = DEFAULT_TARGET;

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      title = clean(form.get("title"), 80) ?? "";
      endless = form.get("endless") === "true";
      target = clampTarget(form.get("target"));
      count = endless ? FIRST_BATCH : clampItemCount(form.get("count"));

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
      endless = body.endless === true;
      target = clampTarget(body.target);
      count = endless ? FIRST_BATCH : clampItemCount(body.count);
      focus = parseFocusList(body.focus);
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

  const { items, attempts } = await generateItems({
    material,
    count,
    packId,
    focus,
    onWarn: (message) => console.warn(`generate-pack: ${message}`),
  });

  if (items.length < (endless ? 1 : MIN_ITEMS_KEPT)) {
    console.warn(
      `generate-pack: kept ${items.length} of ${count} after ${attempts} attempts`,
    );
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
    blurb: endless
      ? `Endless questions from your own material. ${target} to start, raise it as you go.`
      : `${items.length} questions generated from your own material.`,
    items,
    origin: "custom",
    createdAt: Date.now(),
    sourceName: sourceName || undefined,
    ...(endless ? { endless: true, target, material } : {}),
  };

  return NextResponse.json({ pack });
}
