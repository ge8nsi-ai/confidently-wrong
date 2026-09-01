"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudy } from "@/lib/store";
import { DEFAULT_TARGET, FIRST_BATCH, MAX_TARGET, TARGET_STEP } from "@/lib/endless";
import type { Pack } from "@/lib/types";

const MAX_MB = 8;
type Status = "idle" | "working" | "error";
type Mode = "fixed" | "endless";

/** The starting targets offered. Raisable mid-round, so these are only a start. */
const TARGETS = [10, 15, 20, 30, MAX_TARGET];

export default function CustomPackBuilder() {
  const router = useRouter();
  const saveCustomPack = useStudy((s) => s.saveCustomPack);

  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [count, setCount] = useState(4);
  const [mode, setMode] = useState<Mode>("endless");
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * A ticking count of seconds while the pack is being written.
   *
   * Each question is a paid call and there is no honest way to make four of them
   * instant, so the wait is at least made legible: a disabled button with no
   * moving part reads as a hang, and the commonest response to a hang is a reload
   * that throws the finished questions away. Held out of the `aria-live` region
   * below and hidden from the accessibility tree, because a screen reader
   * announcing a new number every second is worse than no number at all.
   */
  useEffect(() => {
    if (status !== "working") return;
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [status]);

  const ready = (file !== null || text.trim().length >= 200) && status !== "working";

  async function generate() {
    setStatus("working");
    setElapsed(0);
    setMessage("Reading your material…");

    try {
      const form = new FormData();
      if (file) form.append("file", file);
      if (text.trim()) form.append("text", text.trim());
      if (title.trim()) form.append("title", title.trim());
      form.append("count", String(count));
      if (mode === "endless") {
        form.append("endless", "true");
        form.append("target", String(target));
      }

      setMessage(
        mode === "endless"
          ? `Writing the first ${FIRST_BATCH} questions. The rest are written while you answer.`
          : file
            ? `Reading the document, then writing ${count} questions. Around a minute.`
            : `Writing ${count} questions from your notes. Around a minute.`,
      );

      const res = await fetch("/api/generate-pack", { method: "POST", body: form });
      const data = (await res.json()) as { pack?: Pack; error?: string };

      if (!res.ok || !data.pack) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Try again.");
        return;
      }

      saveCustomPack(data.pack);
      router.push(`/custom/${data.pack.id}`);
    } catch {
      setStatus("error");
      setMessage("The request failed. Check your connection and try again.");
    }
  }

  return (
    <div className="rise grid gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">
          New pack
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink-50 sm:text-4xl">
          Bring your own material.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-300">
          Attach a PDF or paste your notes. Questions are written from what you
          supply, each wrong answer tied to a misconception a learner would actually
          hold, so the repair round still only fires where you were sure.
        </p>
      </header>

      <section className="glass grid gap-5 rounded-3xl p-5 sm:p-7">
        <div>
          <label
            htmlFor="material-file"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400"
          >
            Attach a file
          </label>
          <input
            id="material-file"
            ref={fileInput}
            type="file"
            accept=".pdf,.txt,.md,.markdown,text/plain,application/pdf"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              if (picked && picked.size > MAX_MB * 1024 * 1024) {
                setStatus("error");
                setMessage(`That file is over ${MAX_MB}MB. Paste the text instead.`);
                return;
              }
              setFile(picked);
              setStatus("idle");
              setMessage("");
            }}
            className="mt-2 block w-full cursor-pointer rounded-2xl border border-ink-600 bg-ink-950/70 px-4 py-3 text-sm text-ink-200 file:mr-4 file:rounded-full file:border-0 file:bg-ink-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink-950"
          />
          <p className="mt-2 text-xs text-ink-400">
            PDF, .txt, or .md, up to {MAX_MB}MB. Scanned pages without text will not
            work.
          </p>
          {file ? (
            <p className="tnum mt-2 text-xs font-semibold text-ink-200">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
                className="ml-3 font-semibold text-iris-300 underline underline-offset-4"
              >
                Remove
              </button>
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="material-text"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400"
          >
            Or paste text
          </label>
          <textarea
            id="material-text"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a chapter, a lecture summary, your revision notes…"
            className="mt-2 w-full resize-y rounded-2xl border border-ink-600 bg-ink-950/70 px-4 py-3 text-sm leading-relaxed text-ink-50 placeholder:text-ink-400"
          />
          <p className="tnum mt-2 text-xs text-ink-400">
            {text.trim().length} characters. Around 200 or more is enough to work with.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="pack-title"
              className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400"
            >
              Pack name
            </label>
            <input
              id="pack-title"
              type="text"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Optional"
              className="mt-2 w-full rounded-2xl border border-ink-600 bg-ink-950/70 px-4 py-3 text-sm text-ink-50 placeholder:text-ink-400"
            />
          </div>
          <div>
            <label
              htmlFor="pack-count"
              className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400"
            >
              {mode === "endless" ? "Aim for" : "Questions"}
            </label>
            {mode === "endless" ? (
              <select
                id="pack-count"
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="mt-2 w-full rounded-2xl border border-ink-600 bg-ink-950/70 px-4 py-3 text-sm text-ink-50"
              >
                {TARGETS.map((n) => (
                  <option key={n} value={n}>
                    {n} questions{n === DEFAULT_TARGET ? " (default)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="pack-count"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="mt-2 w-full rounded-2xl border border-ink-600 bg-ink-950/70 px-4 py-3 text-sm text-ink-50"
              >
                {[4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} questions{n === 4 ? " (fastest)" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/*
          Endless is the default because the fixed path makes the learner wait for
          every question before answering the first one. Both are kept: a fixed pack
          is a known quantity, which is what you want when you are being marked.
        */}
        <fieldset className="grid gap-2">
          <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
            How it runs
          </legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  value: "endless" as Mode,
                  label: "Endless",
                  hint: `Start after ${FIRST_BATCH} questions. More are written in the background, and you can add ${TARGET_STEP} at a time or stop whenever you like.`,
                },
                {
                  value: "fixed" as Mode,
                  label: "Fixed pack",
                  hint: "Every question is written up front, then the pack is saved and replayable.",
                },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-2xl border px-4 py-3 text-sm transition ${
                  mode === option.value
                    ? "border-iris-400 bg-iris-400/10 text-ink-50"
                    : "border-ink-600 text-ink-300 hover:border-ink-400"
                }`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    name="pack-mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={() => setMode(option.value)}
                    className="accent-iris-300"
                  />
                  {option.label}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-400">
                  {option.hint}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={generate}
          disabled={!ready}
          className="w-full rounded-2xl bg-ink-50 px-6 py-4 text-base font-semibold text-ink-950 transition hover:bg-[#3e4d62] disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-300"
        >
          {status === "working" ? (
            <>
              Writing questions
              <span className="tnum" aria-hidden="true">
                {" "}
                · {elapsed}s
              </span>
            </>
          ) : (
            "Generate the pack"
          )}
        </button>

        <p
          aria-live="polite"
          className={`text-sm leading-relaxed ${status === "error" ? "text-ember-300" : "text-ink-400"}`}
        >
          {message ||
            "One question at a time, each checked for exactly one correct answer before it is kept."}
        </p>
      </section>

      <p className="text-xs leading-relaxed text-ink-400">
        Your material is sent to Mistral to read and to write the questions, then the
        uploaded copy is deleted. The finished pack is stored in this browser only.
      </p>
    </div>
  );
}
