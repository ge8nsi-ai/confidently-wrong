import Link from "next/link";
import type { SessionSummary } from "@/lib/history";

function when(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function HistoryList({
  summaries,
  onClear,
}: {
  summaries: SessionSummary[];
  onClear: () => void;
}) {
  return (
    <section aria-labelledby="history-heading" className="glass rounded-3xl p-5 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="history-heading"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
        >
          History
        </h2>
        {summaries.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-ink-600 px-3 py-1 text-xs font-semibold text-ink-300 transition hover:border-ink-400 hover:text-ink-50"
          >
            Clear history
          </button>
        ) : null}
      </div>

      {summaries.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-ink-300">
          No sessions yet. Every pack you answer is recorded here, in this browser.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {summaries.map((s) => (
            <li
              key={s.id}
              className="rounded-2xl border border-ink-700 bg-ink-950/60 px-4 py-3.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold text-ink-50">
                  {s.packTitle}
                </p>
                <p className="tnum shrink-0 text-xs text-ink-400">{when(s.updatedAt)}</p>
              </div>

              <p className="tnum mt-1.5 text-xs text-ink-300">
                {s.correct} of {s.answered} right · CBM {s.cbm >= 0 ? "+" : ""}
                {s.cbm} of {s.cbmMax} · {s.sureWrong} sure and wrong
                {s.recheckSureWrong !== null
                  ? ` → ${s.recheckSureWrong} after recheck`
                  : ""}
              </p>

              <div className="mt-2 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em]">
                <span className="rounded-full border border-ink-600 px-2 py-0.5 text-ink-400">
                  {s.origin === "custom" ? "Your material" : "Built-in"}
                </span>
                {!s.finished ? (
                  <span className="rounded-full border border-ink-600 px-2 py-0.5 text-ink-400">
                    Unfinished
                  </span>
                ) : null}
                <Link
                  href={
                    s.origin === "custom"
                      ? `/custom/${s.packId}`
                      : `/study/${s.packId}`
                  }
                  className="ml-auto font-semibold normal-case tracking-normal text-iris-300 underline decoration-iris-300/40 underline-offset-4 transition hover:text-ink-50"
                >
                  Run it again
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
