"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SpeakButton from "@/components/SpeakButton";
import { MIN_TRANSCRIPT_CHARS, spokenCritique, type Critique } from "@/lib/explain";
import { useStudy } from "@/lib/store";
import type { Pack } from "@/lib/types";

type Stage = "speak" | "transcribing" | "marking" | "marked" | "quizzing";

/**
 * Explain a topic out loud, get marked, then get quizzed on the errors.
 *
 * The microphone needs a secure context, so it is offered when available and the
 * textarea is always there as the equal path: over plain http on a LAN the mic
 * simply never appears and typing still works.
 */
export default function VoiceExplain() {
  const router = useRouter();
  const saveCustomPack = useStudy((s) => s.saveCustomPack);

  const [topic, setTopic] = useState("");
  const [transcript, setTranscript] = useState("");
  const [stage, setStage] = useState<Stage>("speak");
  const [recording, setRecording] = useState(false);
  const [critique, setCritique] = useState<Critique | null>(null);
  const [quizMaterial, setQuizMaterial] = useState("");
  const [message, setMessage] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const busy =
    stage === "transcribing" || stage === "marking" || stage === "quizzing";
  const longEnough = transcript.trim().length >= MIN_TRANSCRIPT_CHARS;

  const transcribeBlob = useCallback(async (blob: Blob) => {
    setStage("transcribing");
    setMessage("Writing down what you said…");
    try {
      const form = new FormData();
      form.append("audio", blob, "explanation.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = (await res.json()) as { text?: string };
      if (!data.text) {
        setMessage("Nothing came back from that recording. Try typing it instead.");
        setStage("speak");
        return;
      }
      // Appended, so a second take adds to the explanation instead of wiping it.
      setTranscript((prev) => (prev ? `${prev.trim()} ${data.text}` : data.text!));
      setMessage("Read it over, fix anything the transcription got wrong, then send it.");
      setStage("speak");
    } catch {
      setMessage("That recording could not be sent. Try typing it instead.");
      setStage("speak");
    }
  }, []);

  async function startRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setMessage("This browser will not give a microphone here. Type it instead.");
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
        setRecording(false);
        if (blob.size > 0) void transcribeBlob(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setMessage("Listening. Explain it as if to someone who has never heard of it.");
    } catch {
      setMessage(
        "Microphone access was declined, or this page is not on https. Type it instead.",
      );
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  async function mark() {
    setStage("marking");
    setCritique(null);
    setMessage("Marking your explanation…");
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), transcript: transcript.trim() }),
      });
      const data = (await res.json()) as {
        critique?: Critique;
        quizMaterial?: string;
        error?: string;
      };
      if (!res.ok || !data.critique) {
        setMessage(data.error ?? "That could not be marked. Try again.");
        setStage("speak");
        return;
      }
      setCritique(data.critique);
      setQuizMaterial(data.quizMaterial ?? "");
      setMessage("");
      setStage("marked");
    } catch {
      setMessage("The request failed. Check your connection and try again.");
      setStage("speak");
    }
  }

  async function buildQuiz() {
    if (!critique) return;
    setStage("quizzing");
    setMessage("Writing questions on the gaps. This takes a moment.");
    try {
      // One question per point that actually came up, so a narrow critique does
      // not get padded out with the same question four times.
      const focus = [
        ...critique.errors.map((e) => e.correction),
        ...critique.gaps,
        ...critique.right,
      ];
      const res = await fetch("/api/generate-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: quizMaterial,
          title: critique.topic,
          sourceName: "Your spoken explanation",
          count: Math.min(8, Math.max(4, critique.errors.length + critique.gaps.length)),
          focus,
        }),
      });
      const data = (await res.json()) as { pack?: Pack; error?: string };
      if (!res.ok || !data.pack) {
        setMessage(data.error ?? "The quiz could not be written. Try again.");
        setStage("marked");
        return;
      }
      saveCustomPack(data.pack);
      router.push(`/custom/${data.pack.id}`);
    } catch {
      setMessage("The request failed. Check your connection and try again.");
      setStage("marked");
    }
  }

  return (
    <div className="rise grid gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">
          Voice mode
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink-50 sm:text-4xl">
          Explain it, out loud, from memory.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-300">
          Say what you think you know. You will be told what was sound, what you
          left out, and which claims were wrong, then quizzed on exactly those,
          with your own wrong claims as the tempting answers.
        </p>
      </header>

      <section className="glass grid gap-5 rounded-3xl p-5 sm:p-7">
        <div>
          <label
            htmlFor="explain-topic"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400"
          >
            Topic
          </label>
          <input
            id="explain-topic"
            type="text"
            value={topic}
            maxLength={80}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="How vaccines work, why the seasons happen, what inflation is…"
            className="mt-2 w-full rounded-2xl border border-ink-600 bg-ink-950/70 px-4 py-3 text-sm text-ink-50 placeholder:text-ink-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={recording ? stopRecording : startRecording}
            className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition disabled:opacity-40 ${
              recording
                ? "bg-ember-900/70 text-ember-300 ring-1 ring-ember-400/70"
                : "bg-ink-50 text-ink-950 hover:bg-[#3e4d62]"
            }`}
          >
            <span aria-hidden>{recording ? "■" : "🎙"}</span>
            {recording ? "Stop and transcribe" : "Record your explanation"}
          </button>
          <span className="text-xs text-ink-400">
            or write it below. Both are marked the same way
          </span>
        </div>

        <div>
          <label
            htmlFor="explain-transcript"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400"
          >
            Your explanation
          </label>
          <textarea
            id="explain-transcript"
            rows={8}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Explain the topic in your own words, as if to someone who has never heard of it."
            className="mt-2 w-full resize-y rounded-2xl border border-ink-600 bg-ink-950/70 px-4 py-3 text-sm leading-relaxed text-ink-50 placeholder:text-ink-400"
          />
          <p className="tnum mt-2 text-xs text-ink-400">
            {transcript.trim().length} characters. {MIN_TRANSCRIPT_CHARS} or more to
            mark it.
          </p>
        </div>

        <button
          type="button"
          onClick={mark}
          disabled={!longEnough || busy}
          className="w-full rounded-2xl bg-ink-50 px-6 py-4 text-base font-semibold text-ink-950 transition hover:bg-[#3e4d62] disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-300"
        >
          {stage === "marking" ? "Marking…" : "Mark my explanation"}
        </button>

        <p
          aria-live="polite"
          className="text-sm leading-relaxed text-ink-400"
        >
          {message ||
            "Nothing is stored on a server. The recording is transcribed, marked, and discarded."}
        </p>
      </section>

      {critique ? (
        <CritiquePanel
          critique={critique}
          onQuiz={buildQuiz}
          quizzing={stage === "quizzing"}
        />
      ) : null}
    </div>
  );
}

function CritiquePanel({
  critique,
  onQuiz,
  quizzing,
}: {
  critique: Critique;
  onQuiz: () => void;
  quizzing: boolean;
}) {
  return (
    <section className="grid gap-4" aria-label="How your explanation was marked">
      <div className="glass rounded-3xl p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
              Marked
            </p>
            <h2 className="mt-2 text-xl font-semibold leading-snug text-ink-50">
              {critique.topic}
            </h2>
          </div>
          <SpeakButton text={spokenCritique(critique)} label="Hear it back" />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-200">{critique.verdict}</p>
      </div>

      {critique.errors.length > 0 ? (
        <div className="glass rounded-3xl p-5 sm:p-7">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-ember-300">
            Wrong ({critique.errors.length})
          </h3>
          <ul className="mt-4 grid gap-4">
            {critique.errors.map((error) => (
              <li
                key={error.claim}
                className="border-l-2 border-ember-500/70 pl-4"
              >
                <p className="text-sm font-semibold leading-snug text-ink-50">
                  You said: {error.claim}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-300">
                  {error.why}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-200">
                  {error.correction}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {critique.gaps.length > 0 ? (
        <ListPanel title="Left out" items={critique.gaps} accent="text-iris-300" />
      ) : null}
      {critique.right.length > 0 ? (
        <ListPanel title="Sound" items={critique.right} accent="text-ink-300" />
      ) : null}

      <div className="glass rounded-3xl p-5 sm:p-7">
        <p className="text-sm leading-relaxed text-ink-300">
          The quiz is written from the corrections above, with your own wrong claims
          as the distractors. Answer with your certainty as usual, and the repair round
          still only fires where you were sure and wrong.
        </p>
        <button
          type="button"
          onClick={onQuiz}
          disabled={quizzing}
          className="mt-4 w-full rounded-2xl bg-ink-50 px-6 py-4 text-base font-semibold text-ink-950 transition hover:bg-[#3e4d62] disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-300"
        >
          {quizzing ? "Writing questions…" : "Quiz me on this"}
        </button>
      </div>
    </section>
  );
}

function ListPanel({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent: string;
}) {
  return (
    <div className="glass rounded-3xl p-5 sm:p-7">
      <h3
        className={`text-xs font-semibold uppercase tracking-[0.16em] ${accent}`}
      >
        {title} ({items.length})
      </h3>
      <ul className="mt-4 grid gap-2.5">
        {items.map((item) => (
          <li key={item} className="text-sm leading-relaxed text-ink-200">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
