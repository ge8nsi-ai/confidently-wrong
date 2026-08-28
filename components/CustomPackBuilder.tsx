"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudy } from "@/lib/store";
import type { Pack } from "@/lib/types";

const MAX_MB = 8;
type Status = "idle" | "working" | "error";

export default function CustomPackBuilder() {
  const router = useRouter();
  const saveCustomPack = useStudy((s) => s.saveCustomPack);

  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [count, setCount] = useState(6);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const ready = (file !== null || text.trim().length >= 200) && status !== "working";

  async function generate() {
    setStatus("working");
    setMessage("Reading your material…");

    try {
      const form = new FormData();
      if (file) form.append("file", file);
      if (text.trim()) form.append("text", text.trim());
      if (title.trim()) form.append("title", title.trim());
      form.append("count", String(count));

      setMessage(
        file
          ? "Reading the document, then writing questions. This takes a moment."
          : "Writing questions from your notes. This takes a moment.",
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
          hold — so the repair round still only fires where you were sure.
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
              Questions
            </label>
            <select
              id="pack-count"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="mt-2 w-full rounded-2xl border border-ink-600 bg-ink-950/70 px-4 py-3 text-sm text-ink-50"
            >
              {[4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={!ready}
          className="w-full rounded-2xl bg-ink-50 px-6 py-4 text-base font-semibold text-ink-950 transition hover:bg-[#3e4d62] disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-300"
        >
          {status === "working" ? "Writing questions…" : "Generate the pack"}
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
