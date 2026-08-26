"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "loading" | "playing";

/**
 * Reads text aloud with Mistral Voxtral TTS. If the server has no key or the call
 * fails it returns 204 and we fall back to the browser's own speech synthesis, so
 * the button always does something.
 */
export default function SpeakButton({
  text,
  label = "Read aloud",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  function speakLocally() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setStatus("idle");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.onend = () => setStatus("idle");
    utterance.onerror = () => setStatus("idle");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setStatus("playing");
  }

  async function toggle() {
    if (status !== "idle") {
      cleanup();
      setStatus("idle");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (res.status === 204 || !res.ok) {
        speakLocally();
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        cleanup();
        setStatus("idle");
      };
      audio.onerror = () => speakLocally();
      await audio.play();
      setStatus("playing");
    } catch {
      speakLocally();
    }
  }

  const busy = status === "loading";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={status === "playing" ? "Stop reading aloud" : label}
      className={`inline-flex items-center gap-1.5 rounded-full border border-ink-600/70 bg-ink-850/70 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:border-iris-400/70 hover:text-ink-50 disabled:opacity-60 ${className}`}
      disabled={busy}
    >
      <span aria-hidden>
        {status === "playing" ? "■" : busy ? "…" : "▶"}
      </span>
      {status === "playing" ? "Stop" : busy ? "Loading" : label}
    </button>
  );
}
