"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { calibration, overconfidenceSentence } from "@/lib/scoring";
import type { Response } from "@/lib/types";

const CONF_TICKS = [40, 70, 90];
const CONF_NAMES: Record<number, string> = {
  40: "Guessing",
  70: "Fairly sure",
  90: "Certain",
};

interface Row {
  stated: number;
  before?: number;
  after?: number;
  nBefore?: number;
  nAfter?: number;
}

function toRows(before: Response[], after: Response[]): Row[] {
  const map = new Map<number, Row>();
  for (const b of calibration(before)) {
    map.set(b.stated * 100, {
      stated: b.stated * 100,
      before: Math.round(b.observed * 100),
      nBefore: b.n,
    });
  }
  for (const a of calibration(after)) {
    const key = a.stated * 100;
    const row = map.get(key) ?? { stated: key };
    row.after = Math.round(a.observed * 100);
    row.nAfter = a.n;
    map.set(key, row);
  }
  return [...map.values()].sort((x, y) => x.stated - y.stated);
}

/**
 * Stated confidence against observed accuracy, with a dashed diagonal for perfect
 * calibration. Pass `after` to overlay a second round on the same axes.
 */
export default function CalibrationChart({
  responses,
  after,
  showSentence = true,
}: {
  responses: Response[];
  after?: Response[];
  showSentence?: boolean;
}) {
  const rows = toRows(responses, after ?? []);
  const hasAfter = (after?.length ?? 0) > 0;

  return (
    <section aria-labelledby="calibration-heading">
      <h2
        id="calibration-heading"
        className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
      >
        Calibration
      </h2>

      <div className="glass mt-4 rounded-3xl p-4 pb-2 sm:p-6 sm:pb-3">
        <div className="h-64 w-full sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
              margin={{ top: 8, right: 12, bottom: 24, left: 4 }}
            >
              <CartesianGrid
                stroke="var(--color-ink-700)"
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="stated"
                type="number"
                domain={[30, 100]}
                ticks={CONF_TICKS}
                tickFormatter={(v: number) => CONF_NAMES[v] ?? `${v}%`}
                stroke="var(--color-ink-400)"
                tick={{ fontSize: 11, fill: "var(--color-ink-400)" }}
                label={{
                  value: "How sure you said you were",
                  position: "insideBottom",
                  offset: -14,
                  fill: "var(--color-ink-400)",
                  fontSize: 11,
                }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v: number) => `${v}%`}
                stroke="var(--color-ink-400)"
                tick={{ fontSize: 11, fill: "var(--color-ink-400)" }}
                width={44}
                label={{
                  value: "How often you were right",
                  angle: -90,
                  position: "insideLeft",
                  offset: 14,
                  style: {
                    textAnchor: "middle",
                    fill: "var(--color-ink-400)",
                    fontSize: 11,
                  },
                }}
              />
              <ReferenceLine
                segment={[
                  { x: 30, y: 30 },
                  { x: 100, y: 100 },
                ]}
                stroke="var(--color-ink-400)"
                strokeDasharray="6 5"
                ifOverflow="extendDomain"
                label={{
                  value: "perfectly calibrated",
                  position: "insideTopLeft",
                  fill: "var(--color-ink-400)",
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-ink-900)",
                  border: "1px solid var(--color-ink-600)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "var(--color-ink-50)",
                }}
                labelFormatter={(v) => CONF_NAMES[Number(v)] ?? String(v)}
                formatter={(value, name) => [`${value}% right`, String(name)]}
              />
              {hasAfter ? (
                <Legend
                  verticalAlign="top"
                  height={28}
                  wrapperStyle={{ fontSize: 12, color: "var(--color-ink-300)" }}
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="before"
                name={hasAfter ? "Before" : "You"}
                stroke="var(--color-ember-400)"
                strokeWidth={2.5}
                dot={{ r: 5, fill: "var(--color-ember-400)" }}
                activeDot={{ r: 7 }}
                connectNulls
              />
              {hasAfter ? (
                <Line
                  type="monotone"
                  dataKey="after"
                  name="After"
                  stroke="var(--color-mint-400)"
                  strokeWidth={2.5}
                  strokeDasharray="5 3"
                  dot={{ r: 5, fill: "var(--color-mint-400)" }}
                  activeDot={{ r: 7 }}
                  connectNulls
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {showSentence ? (
        <p className="mt-4 text-base leading-relaxed text-ink-200 sm:text-lg">
          {overconfidenceSentence(responses)}
        </p>
      ) : null}

      <ul className="mt-3 grid gap-1 text-xs text-ink-400 sm:grid-cols-3">
        {rows.map((r) => (
          <li key={r.stated} className="tnum">
            {CONF_NAMES[r.stated]}: {r.nBefore ?? 0} answer
            {(r.nBefore ?? 0) === 1 ? "" : "s"}
            {r.before !== undefined ? `, ${r.before}% right` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
