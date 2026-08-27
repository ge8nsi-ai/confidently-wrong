/**
 * Server-only Mistral helpers.
 *
 * The API key is read from process.env inside these functions and never leaves the
 * server. It must never be exposed as a NEXT_PUBLIC_ variable.
 */

const API_BASE = "https://api.mistral.ai/v1";

/** Ministral 3B is the main model for the whole project. */
export const CHAT_MODEL = process.env.MISTRAL_MODEL ?? "ministral-3b-latest";
export const TTS_MODEL = process.env.MISTRAL_TTS_MODEL ?? "voxtral-mini-tts-latest";
export const TRANSCRIBE_MODEL =
  process.env.MISTRAL_TRANSCRIBE_MODEL ?? "voxtral-mini-latest";
export const TTS_VOICE = process.env.MISTRAL_TTS_VOICE ?? "gb_oliver_neutral";
export const OCR_MODEL = process.env.MISTRAL_OCR_MODEL ?? "mistral-ocr-latest";
export const EMBED_MODEL = process.env.MISTRAL_EMBED_MODEL ?? "mistral-embed";

/**
 * Bounds on one embedding call. The endpoint that uses it is public, and a
 * caller could otherwise ask for a vector per paragraph of a 12,000-character
 * upload.
 */
const MAX_EMBED_TEXTS = 24;
const MAX_EMBED_CHARS = 600;

export function hasKey(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
}

function key(): string {
  const k = process.env.MISTRAL_API_KEY;
  if (!k) throw new Error("MISTRAL_API_KEY is not set");
  return k;
}

async function withTimeout<T>(
  ms: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Chat completion forced to JSON output. Throws on any non-2xx or timeout. */
export async function chatJson(
  messages: ChatMessage[],
  opts: { maxTokens: number; timeoutMs?: number; temperature?: number } = {
    maxTokens: 400,
  },
): Promise<unknown> {
  const res = await withTimeout(opts.timeoutMs ?? 12_000, (signal) =>
    fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key()}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        // Hard cap: this endpoint is public, so token spend is bounded per call.
        max_tokens: opts.maxTokens,
        temperature: opts.temperature ?? 0.2,
        response_format: { type: "json_object" },
      }),
    }),
  );

  if (!res.ok) throw new Error(`mistral chat ${res.status}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("mistral chat: empty content");
  return JSON.parse(content);
}

/**
 * Embeds short texts, in the order given.
 *
 * Used to tell a reworded question from a new one: word overlap misses
 * "why does the Sun's tidal effect feel weaker" against "why does the Sun's
 * gravity have a smaller tidal effect", which are the same question.
 */
export async function embed(
  texts: string[],
  opts: { timeoutMs?: number } = {},
): Promise<number[][]> {
  const input = texts
    .slice(0, MAX_EMBED_TEXTS)
    .map((text) => text.slice(0, MAX_EMBED_CHARS));
  if (input.length === 0) return [];

  const res = await withTimeout(opts.timeoutMs ?? 10_000, (signal) =>
    fetch(`${API_BASE}/embeddings`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key()}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input }),
    }),
  );

  if (!res.ok) throw new Error(`mistral embed ${res.status}`);
  const body = (await res.json()) as {
    data?: { index?: number; embedding?: number[] }[];
  };
  const rows = body.data ?? [];
  if (rows.length !== input.length) throw new Error("mistral embed: short reply");

  // The API documents the order but returns an index with each row; trusting the
  // index rather than the position means a reordered reply cannot silently pair
  // a vector with the wrong question.
  const out: number[][] = new Array(input.length);
  rows.forEach((row, position) => {
    const at = typeof row.index === "number" ? row.index : position;
    if (at < 0 || at >= input.length || !Array.isArray(row.embedding)) {
      throw new Error("mistral embed: unusable row");
    }
    out[at] = row.embedding;
  });
  if (out.some((vector) => !vector)) throw new Error("mistral embed: missing row");
  return out;
}

/** Voxtral text-to-speech. Returns raw MP3 bytes. */
export async function speak(
  input: string,
  opts: { voice?: string; timeoutMs?: number } = {},
): Promise<Uint8Array> {
  const res = await withTimeout(opts.timeoutMs ?? 25_000, (signal) =>
    fetch(`${API_BASE}/audio/speech`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key()}`,
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: opts.voice ?? TTS_VOICE,
        input,
      }),
    }),
  );

  if (!res.ok) throw new Error(`mistral tts ${res.status}`);
  const body = (await res.json()) as { audio_data?: string };
  if (!body.audio_data) throw new Error("mistral tts: no audio_data");
  return Uint8Array.from(Buffer.from(body.audio_data, "base64"));
}

/** Voxtral speech-to-text. */
export async function transcribe(
  file: Blob,
  filename: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const form = new FormData();
  form.append("model", TRANSCRIBE_MODEL);
  form.append("file", file, filename);

  const res = await withTimeout(opts.timeoutMs ?? 25_000, (signal) =>
    fetch(`${API_BASE}/audio/transcriptions`, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${key()}` },
      body: form,
    }),
  );

  if (!res.ok) throw new Error(`mistral transcribe ${res.status}`);
  const body = (await res.json()) as { text?: string };
  return (body.text ?? "").trim();
}

/**
 * Reads a PDF into markdown with Mistral OCR: upload, take a short-lived signed
 * URL, then OCR it. The upload is deleted afterwards on a best-effort basis so
 * study material does not sit in the workspace.
 */
export async function ocrDocument(
  file: Blob,
  filename: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const form = new FormData();
  form.append("purpose", "ocr");
  form.append("file", file, filename);

  const upload = await withTimeout(timeoutMs, (signal) =>
    fetch(`${API_BASE}/files`, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${key()}` },
      body: form,
    }),
  );
  if (!upload.ok) throw new Error(`mistral upload ${upload.status}`);
  const { id } = (await upload.json()) as { id?: string };
  if (!id) throw new Error("mistral upload: no file id");

  try {
    const signed = await withTimeout(timeoutMs, (signal) =>
      fetch(`${API_BASE}/files/${id}/url?expiry=1`, {
        signal,
        headers: { Authorization: `Bearer ${key()}` },
      }),
    );
    if (!signed.ok) throw new Error(`mistral signed url ${signed.status}`);
    const { url } = (await signed.json()) as { url?: string };
    if (!url) throw new Error("mistral signed url: missing url");

    const res = await withTimeout(timeoutMs, (signal) =>
      fetch(`${API_BASE}/ocr`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key()}`,
        },
        body: JSON.stringify({
          model: OCR_MODEL,
          document: { type: "document_url", document_url: url },
          include_image_base64: false,
        }),
      }),
    );
    if (!res.ok) throw new Error(`mistral ocr ${res.status}`);
    const body = (await res.json()) as { pages?: { markdown?: string }[] };
    return (body.pages ?? [])
      .map((p) => p.markdown ?? "")
      .join("\n\n")
      .trim();
  } finally {
    void fetch(`${API_BASE}/files/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key()}` },
    }).catch(() => undefined);
  }
}
