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
