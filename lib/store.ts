"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Conf, Item, Pack, Phase, Refutation, Response } from "./types";
import { needsRefutation } from "./scoring";
import { toVariant } from "./variants";

export function refutationKey(itemId: string, chosenOptionId: string): string {
  return `${itemId}:${chosenOptionId}`;
}

interface State {
  phase: Phase;
  pack: Pack | null;
  index: number;
  responses: Response[];
  pendingConf: Conf | null;
  refutations: Record<string, Refutation>;
  loadingRefutations: boolean;
}

interface Actions {
  startPack: (pack: Pack) => void;
  setPendingConf: (conf: Conf | null) => void;
  answer: (item: Item, chosenOptionId: string, conf: Conf) => void;
  setPhase: (phase: Phase) => void;
  setRefutation: (key: string, refutation: Refutation) => void;
  setLoadingRefutations: (loading: boolean) => void;
  beginRecheck: () => void;
  reset: () => void;
}

const initial: State = {
  phase: "pick",
  pack: null,
  index: 0,
  responses: [],
  pendingConf: null,
  refutations: {},
  loadingRefutations: false,
};

/**
 * Deliberately holds no derived values. Scores, quadrants and calibration are
 * computed on demand by the pure helpers in lib/scoring.ts.
 */
export const useStudy = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initial,

      startPack: (pack) =>
        set({
          ...initial,
          pack,
          phase: "probe",
        }),

      setPendingConf: (pendingConf) => set({ pendingConf }),

      answer: (item, chosenOptionId, conf) => {
        const chosen = item.options.find((o) => o.id === chosenOptionId);
        const response: Response = {
          itemId: item.id,
          chosenOptionId,
          conf,
          correct: Boolean(chosen?.correct),
          round: item.variantOf ? "recheck" : "probe",
        };
        const responses = [...get().responses, response];
        const roundItems = currentRoundItems(get().pack, responses, get().phase);
        const nextIndex = get().index + 1;
        const finished = nextIndex >= roundItems.length;

        set({
          responses,
          pendingConf: null,
          index: finished ? 0 : nextIndex,
          phase: finished
            ? get().phase === "probe"
              ? "reveal"
              : "done"
            : get().phase,
        });
      },

      setPhase: (phase) => set({ phase, index: 0, pendingConf: null }),

      setRefutation: (key, refutation) =>
        set((s) => ({ refutations: { ...s.refutations, [key]: refutation } })),

      setLoadingRefutations: (loadingRefutations) => set({ loadingRefutations }),

      beginRecheck: () => set({ phase: "recheck", index: 0, pendingConf: null }),

      reset: () => set({ ...initial }),
    }),
    {
      name: "confidently-wrong.v1",
      version: 1,
    },
  ),
);

/** Probe responses only — the first pass through the pack. */
export function probeResponses(responses: Response[]): Response[] {
  return responses.filter((r) => r.round === "probe");
}

export function recheckResponses(responses: Response[]): Response[] {
  return responses.filter((r) => r.round === "recheck");
}

/** Items the learner got wrong in the probe round, in pack order. */
export function missedItems(pack: Pack | null, responses: Response[]): Item[] {
  if (!pack) return [];
  const wrong = new Set(
    probeResponses(responses)
      .filter((r) => !r.correct)
      .map((r) => r.itemId),
  );
  return pack.items.filter((i) => wrong.has(i.id));
}

export function recheckItems(pack: Pack | null, responses: Response[]): Item[] {
  return missedItems(pack, responses).map((item, i) => toVariant(item, i));
}

/** Wrong probe answers that were held with certainty — the refutation set. */
export function sureWrongResponses(responses: Response[]): Response[] {
  return probeResponses(responses).filter(needsRefutation);
}

function currentRoundItems(
  pack: Pack | null,
  responses: Response[],
  phase: Phase,
): Item[] {
  if (!pack) return [];
  if (phase === "recheck") {
    // The recheck list is fixed by the probe round, so it is stable mid-round.
    return recheckItems(pack, responses);
  }
  return pack.items;
}
