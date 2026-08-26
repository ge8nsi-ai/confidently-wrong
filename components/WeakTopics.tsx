import type { TopicStat } from "@/lib/topics";

/** A weakness bar. Width and the text both carry the value, never colour alone. */
function Bar({ stat }: { stat: TopicStat }) {
  const pct = Math.round(Math.min(1, stat.weakness / 2) * 100);
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
      <div
        className="h-full rounded-full bg-ember-500"
        style={{ width: `${Math.max(6, pct)}%` }}
        aria-hidden
      />
    </div>
  );
}

function detail(stat: TopicStat): string {
  const missed = `missed ${stat.wrong} of ${stat.attempts}`;
  if (stat.sureWrong === 0) return `${missed}, always as a guess`;
  if (stat.sureWrong === stat.wrong)
    return `${missed}, every miss held with certainty`;
  return `${missed}, ${stat.sureWrong} held with certainty`;
}

export default function WeakTopics({ topics }: { topics: TopicStat[] }) {
  return (
    <section aria-labelledby="weak-heading" className="glass rounded-3xl p-5 sm:p-7">
      <h2
        id="weak-heading"
        className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
      >
        Where you are weakest
      </h2>

      {topics.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-ink-300">
          Nothing yet. Finish a pack and the topics you missed will be ranked here,
          worst first.
        </p>
      ) : (
        <>
          <ol className="mt-4 grid gap-4">
            {topics.map((stat, i) => (
              <li key={stat.conceptId}>
                <div className="flex items-baseline gap-3">
                  <span className="tnum text-xs font-bold text-ink-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-50">{stat.topic}</p>
                    <p className="tnum mt-0.5 text-xs text-ink-400">
                      {detail(stat)} · {stat.packTitles.join(", ")}
                    </p>
                    <Bar stat={stat} />
                  </div>
                  {stat.sureWrong > 0 ? (
                    <span className="shrink-0 rounded-full border border-ember-500/70 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ember-500">
                      ! sure
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-xs leading-relaxed text-ink-400">
            Ranked by how often you missed the topic, counting a miss you held with
            certainty twice.
          </p>
        </>
      )}
    </section>
  );
}
