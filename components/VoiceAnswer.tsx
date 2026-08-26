"use client";

import { useCallback, useRef, useState } from "react";
import type { Option } from "@/lib/types";

type Status = "idle" | "recording" | "working" | "unsupported";

/**
 * Records a spoken answer, sends it to Voxtral for transcription, and asks
 * Ministral 3B which option it maps to. Purely additive: tapping an option still
 * works, and any failure just shows the transcript so the learner can tap.
 */
export default function VoiceAnswer({
  options,
  onMatch,
  disabled = false,
}: {
  options: Option[];
  onMatch: (optionId: string) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const send = useCallback(
    async (blob: Blob) => {
      setStatus("working");
      const form = new FormData();
      form.append("audio", blob, "answer.webm");
      form.append(
        "options",
        JSON.stringify(options.map((o) => ({ id: o.id, text: o.text }))),
      );
      try {
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          text?: string;
          matchedOptionId?: string | null;
        };
        setTranscript(data.text || null);
        if (data.matchedOptionId) {
          setNote(null);
          onMatch(data.matchedOptionId);
        } else {
          setNote(
            data.text
              ? "Could not match that to an option — tap one instead."
              : "Voice input is unavailable right now — tap an option instead.",
          );
        }
      } catch {
        setNote("Voice input failed — tap an option instead.");
      } finally {
        setStatus("idle");
      }
    },
    [onMatch, options],
  );

  async function start() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setStatus("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size > 0) void send(blob);
        else setStatus("idle");
      };
      recorderRef.current = recorder;
      recorder.start();
      setNote(null);
      setTranscript(null);
      setStatus("recording");
    } catch {
      setStatus("unsupported");
      setNote("Microphone access was declined — tap an option instead.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  if (status === "unsupported" && !note) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={disabled || status === "working"}
        onClick={status === "recording" ? stop : start}
        aria-label={
          status === "recording" ? "Stop recording" : "Answer by speaking"
        }
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
          status === "recording"
            ? "border-ember-400/80 bg-ember-900/60 text-ember-300"
            : "border-ink-600/70 bg-ink-850/70 text-ink-200 hover:border-iris-400/70 hover:text-ink-50"
        }`}
      >
        <span aria-hidden>{status === "recording" ? "■" : "🎙"}</span>
        {status === "recording"
          ? "Stop and submit"
          : status === "working"
            ? "Transcribing…"
            : "Answer by voice"}
      </button>

      <p aria-live="polite" className="mt-2 text-xs leading-relaxed text-ink-400">
        {transcript ? `Heard: “${transcript}”` : ""}
        {transcript && note ? " " : ""}
        {note ?? ""}
      </p>
    </div>
  );
}
