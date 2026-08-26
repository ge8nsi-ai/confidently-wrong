"use client";

import { useEffect } from "react";
import type { Conf } from "@/lib/types";

const LEVELS: { conf: Conf; label: string; hint: string }[] = [
  { conf: 1, label: "Guessing", hint: "No penalty if wrong" },
  { conf: 2, label: "Fairly sure", hint: "Costs you if wrong" },
  { conf: 3, label: "Certain", hint: "Costs you a lot if wrong" },
];

/** Three large certainty buttons. Keys 1, 2 and 3 select them. */
export default function ConfidencePicker({
  value,
  onChange,
  onConfirm,
  disabled = false,
}: {
  value: Conf | null;
  onChange: (conf: Conf) => void;
  onConfirm: (conf: Conf) => void;
  disabled?: boolean;
}) {
  useEffect(() => {
    if (disabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        e.preventDefault();
        onChange(Number(e.key) as Conf);
      }
      if (e.key === "Enter" && value) {
        e.preventDefault();
        onConfirm(value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, onChange, onConfirm, value]);

  return (
    <fieldset disabled={disabled} className="mt-2">
      <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">
        How sure are you?
      </legend>
      <div
        role="radiogroup"
        aria-label="How sure are you?"
        className="mt-3 grid gap-2.5 sm:grid-cols-3"
      >
        {LEVELS.map(({ conf, label, hint }) => {
          const selected = value === conf;
          return (
            <button
              key={conf}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(conf)}
              className={`flex min-h-20 flex-col items-start justify-center rounded-2xl border px-4 py-3.5 text-left transition ${
                selected
                  ? "border-iris-400 bg-iris-900/70 text-ink-50 shadow-[0_0_0_1px_var(--color-iris-400)]"
                  : "border-ink-600/70 bg-ink-850/60 text-ink-200 hover:border-ink-400/70 hover:bg-ink-800/70"
              } disabled:opacity-50`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-base font-semibold sm:text-[1.05rem]">
                  {label}
                </span>
                <span
                  aria-hidden
                  className={`tnum grid size-6 shrink-0 place-items-center rounded-md border text-[0.7rem] font-semibold ${
                    selected
                      ? "border-iris-300 text-iris-300"
                      : "border-ink-600 text-ink-400"
                  }`}
                >
                  {conf}
                </span>
              </span>
              <span className="mt-1 text-xs leading-snug text-ink-400">{hint}</span>
              {selected ? (
                <span className="sr-only">Selected</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-400">
        Press <kbd className="font-mono">1</kbd>, <kbd className="font-mono">2</kbd>{" "}
        or <kbd className="font-mono">3</kbd>, then{" "}
        <kbd className="font-mono">Enter</kbd>.
      </p>
    </fieldset>
  );
}
