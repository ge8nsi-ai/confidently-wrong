"use client";

import { useState } from "react";
import ConfidencePicker from "./ConfidencePicker";
import SpeakButton from "./SpeakButton";
import VoiceAnswer from "./VoiceAnswer";
import type { Conf, Item } from "@/lib/types";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * One question. Options first, then certainty. No correctness feedback is shown
 * here — that is the whole point of the probe round.
 */
export default function ProbeCard({
  item,
  position,
  total,
  round,
  onSubmit,
}: {
  item: Item;
  position: number;
  total: number;
  round: "probe" | "recheck";
  onSubmit: (chosenOptionId: string, conf: Conf) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [conf, setConf] = useState<Conf | null>(null);

  // The parent remounts this card per item via `key`, so state resets naturally.
  const ready = chosen !== null && conf !== null;
  const spokenText = `${item.stem} ${item.options
    .map((o, i) => `Option ${LETTERS[i]}. ${o.text}`)
    .join(" ")}`;

  return (
    <article className="rise glass rounded-[2rem] p-4 sm:p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="tnum text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">
          {round === "recheck" ? "Recheck · " : ""}
          {position} of {total}
        </p>
        <SpeakButton text={spokenText} label="Read question" />
      </header>

      <div
        className="mt-3 h-1 w-full overflow-hidden rounded-full bg-ink-800"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={position}
        aria-label={`Question ${position} of ${total}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-iris-400 to-ember-400 transition-[width] duration-500"
          style={{ width: `${(position / total) * 100}%` }}
        />
      </div>

      <div className="mt-5 rounded-[1.5rem] bg-[#f3d8cf] px-5 py-6 sm:px-7 sm:py-8">
      <h1 className="text-xl font-semibold leading-snug text-ink-50 sm:text-[1.65rem]">
        {item.stem}
      </h1>
      </div>

      <div
        role="radiogroup"
        aria-label="Answer options"
        className="mt-5 grid gap-2.5"
      >
        {item.options.map((option, i) => {
          const selected = chosen === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChosen(option.id)}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition shadow-sm ${
                selected
                  ? "border-iris-400 bg-iris-900/60 text-ink-50"
                  : "border-ink-600/60 bg-ink-850/50 text-ink-200 hover:border-ink-400/70 hover:bg-ink-800/60"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-semibold ${
                  selected
                    ? "border-iris-300 bg-iris-400/20 text-iris-300"
                    : "border-ink-600 text-ink-400"
                }`}
              >
                {selected ? "✓" : LETTERS[i]}
              </span>
              <span className="text-[0.98rem] leading-relaxed sm:text-base">
                {option.text}
              </span>
            </button>
          );
        })}
      </div>

      <VoiceAnswer options={item.options} onMatch={(id) => setChosen(id)} />

      <div className="mt-7 border-t border-ink-700/70 pt-6">
        <ConfidencePicker
          value={conf}
          onChange={setConf}
          onConfirm={(c) => chosen && onSubmit(chosen, c)}
          disabled={chosen === null}
        />
        {chosen === null ? (
          <p className="mt-2 text-xs text-ink-400">
            Choose an answer first.
          </p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={!ready}
        onClick={() => ready && onSubmit(chosen, conf)}
        className="mt-6 w-full rounded-2xl bg-ink-50 px-6 py-4 text-base font-semibold text-ink-950 shadow-[0_8px_0_#d6c1bb] transition hover:-translate-y-0.5 hover:bg-[#3e4d62] disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400 disabled:shadow-none"
      >
        {position === total ? "Finish round" : "Next question"}
      </button>
      <p className="mt-3 text-center text-xs text-ink-400">
        No feedback until the end. That is deliberate.
      </p>
    </article>
  );
}
