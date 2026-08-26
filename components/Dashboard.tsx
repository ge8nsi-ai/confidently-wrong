"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import CalibrationChart from "./CalibrationChart";
import HistoryList from "./HistoryList";
import WeakTopics from "./WeakTopics";
import { lifetimeStats, sortedSessions, summarizeSession } from "@/lib/history";
import { allResponses, weakTopics } from "@/lib/topics";
import { useStudy } from "@/lib/store";

export default function Dashboard() {
  const hydrated = useSyncExternalStore(
    (onChange) => useStudy.persist.onFinishHydration(onChange),
    () => useStudy.persist.hasHydrated(),
    () => false,
  );

  const sessions = useStudy((s) => s.sessions);
  const customPacks = useStudy((s) => s.customPacks);
  const clearHistory = useStudy((s) => s.clearHistory);
  const deleteCustomPack = useStudy((s) => s.deleteCustomPack);

  const view = useMemo(() => {
    const ordered = sortedSessions(sessions);
    return {
      stats: lifetimeStats(sessions),
      weak: weakTopics(sessions),
      responses: allResponses(sessions),
      summaries: ordered.map(summarizeSession),
    };
  }, [sessions]);

  if (!hydrated) {
    return (
      <p className="text-sm text-ink-400" aria-live="polite">
        Loading your history…
      </p>
    );
  }

  const { stats, weak, responses, summaries } = view;
  const points = Math.round(stats.overconfidence * 100);

  return (
    <div className="rise grid gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">
          Dashboard
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink-50 sm:text-4xl">
          {stats.answered === 0
            ? "Nothing measured yet."
            : "What your certainty says about you."}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-300">
          {stats.answered === 0
            ? "Answer a pack and this page fills in: the topics you keep missing, your calibration across every session, and the history of each run."
            : `Across ${stats.sessions} session${stats.sessions === 1 ? "" : "s"} and ${stats.answered} question${stats.answered === 1 ? "" : "s"}, all held in this browser.`}
        </p>
      </header>

      <section
        aria-labelledby="totals-heading"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <h2 id="totals-heading" className="sr-only">
          Lifetime totals
        </h2>
        <Stat label="Questions answered" value={String(stats.answered)} />
        <Stat
          label="Answered correctly"
          value={`${Math.round(stats.accuracy * 100)}%`}
        />
        <Stat
          label="Sure and wrong"
          value={String(stats.sureWrong)}
          note="The beliefs worth repairing"
          alarm={stats.sureWrong > 0}
        />
        <Stat
          label="Overconfidence"
          value={`${points >= 0 ? "+" : ""}${points} pts`}
          note={
            points >= 5
              ? "More sure than right"
              : points <= -5
                ? "Less sure than right"
                : "Closely matched"
          }
        />
      </section>

      <WeakTopics topics={weak} />

      {responses.length > 0 ? <CalibrationChart responses={responses} /> : null}

      <CustomPacks packs={customPacks} onDelete={deleteCustomPack} />

      <HistoryList summaries={summaries} onClear={clearHistory} />
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  alarm = false,
}: {
  label: string;
  value: string;
  note?: string;
  alarm?: boolean;
}) {
  return (
    <div
      className={`glass rounded-2xl px-5 py-4 ${alarm ? "border-ember-500/70" : ""}`}
    >
      <p className="text-xs font-medium text-ink-400">{label}</p>
      <p
        className={`tnum mt-1.5 text-3xl font-semibold leading-none ${alarm ? "text-ember-500" : "text-ink-50"}`}
      >
        {value}
      </p>
      {note ? <p className="mt-1.5 text-xs text-ink-400">{note}</p> : null}
    </div>
  );
}

function CustomPacks({
  packs,
  onDelete,
}: {
  packs: { id: string; title: string; items: unknown[]; sourceName?: string }[];
  onDelete: (id: string) => void;
}) {
  return (
    <section aria-labelledby="custom-heading" className="glass rounded-3xl p-5 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="custom-heading"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
        >
          Your packs
        </h2>
        <Link
          href="/packs/new"
          className="rounded-full bg-ink-50 px-3.5 py-1.5 text-xs font-semibold text-ink-950 transition hover:-translate-y-0.5"
        >
          New pack
        </Link>
      </div>

      {packs.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-ink-300">
          Attach a PDF or paste your notes and questions get written from your own
          material, misconceptions and all.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {packs.map((pack) => (
            <li
              key={pack.id}
              className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-950/60 px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-50">
                  {pack.title}
                </p>
                <p className="tnum mt-0.5 truncate text-xs text-ink-400">
                  {pack.items.length} questions
                  {pack.sourceName ? ` · ${pack.sourceName}` : ""}
                </p>
              </div>
              <Link
                href={`/custom/${pack.id}`}
                className="shrink-0 rounded-full border border-ink-600 px-3 py-1.5 text-xs font-semibold text-ink-200 transition hover:border-ink-400 hover:text-ink-50"
              >
                Study
              </Link>
              <button
                type="button"
                onClick={() => onDelete(pack.id)}
                aria-label={`Delete ${pack.title}`}
                className="shrink-0 rounded-full border border-ink-600 px-3 py-1.5 text-xs font-semibold text-ink-400 transition hover:border-ember-500 hover:text-ember-500"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
