"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Conf,
  Item,
  Pack,
  Phase,
  Refutation,
  Response,
  SessionRecord,
} from "./types";
import { needsRefutation } from "./scoring";
import { orderByHeldBelief } from "./belief";
import { itemMetaFor } from "./topics";
import { toVariant } from "./variants";

export function refutationKey(itemId: string, chosenOptionId: string): string {
  return `${itemId}:${chosenOptionId}`;
}

/** Keeps localStorage from growing without bound. */
export const MAX_SESSIONS = 50;
export const MAX_CUSTOM_PACKS = 20;

interface State {
  phase: Phase;
  pack: Pack | null;
  index: number;
  responses: Response[];
  pendingConf: Conf | null;
  refutations: Record<string, Refutation>;
  loadingRefutations: boolean;
  /** Set when a pack starts, so the history record can be upserted. */
  sessionId: string | null;
  sessions: SessionRecord[];
  customPacks: Pack[];
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
  recordSession: (finished: boolean) => void;
  saveCustomPack: (pack: Pack) => void;
  deleteCustomPack: (packId: string) => void;
  clearHistory: () => void;
}

const initial: Omit<State, "sessions" | "customPacks"> = {
  phase: "pick",
  pack: null,
  index: 0,
  responses: [],
  pendingConf: null,
  refutations: {},
  loadingRefutations: false,
  sessionId: null,
};

/**
 * Deliberately holds no derived values. Scores, quadrants and calibration are
 * computed on demand by the pure helpers in lib/scoring.ts.
 */
export const useStudy = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initial,
      sessions: [],
      customPacks: [],

      startPack: (pack) =>
        set({
          ...initial,
          pack,
          phase: "probe",
          sessionId: `${pack.id}-${Date.now().toString(36)}`,
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

        // History is written as soon as the probe round ends, so an abandoned
        // session still shows up on the dashboard.
        if (finished) get().recordSession(get().phase === "done");
      },

      setPhase: (phase) => {
        set({ phase, index: 0, pendingConf: null });
        if (phase === "done") get().recordSession(true);
      },

      setRefutation: (key, refutation) =>
        set((s) => ({ refutations: { ...s.refutations, [key]: refutation } })),

      setLoadingRefutations: (loadingRefutations) => set({ loadingRefutations }),

      beginRecheck: () => set({ phase: "recheck", index: 0, pendingConf: null }),

      reset: () => set({ ...initial }),

      /** Upserts the current run into history. Keyed on sessionId. */
      recordSession: (finished) => {
        const { pack, responses, sessionId, sessions } = get();
        if (!pack || !sessionId) return;
        const probe = probeResponses(responses);
        if (probe.length === 0) return;

        const existing = sessions.find((s) => s.id === sessionId);
        const record: SessionRecord = {
          id: sessionId,
          packId: pack.id,
          packTitle: pack.title,
          origin: pack.origin ?? "builtin",
          startedAt: existing?.startedAt ?? Date.now(),
          updatedAt: Date.now(),
          finished: finished || Boolean(existing?.finished),
          probe,
          recheck: recheckResponses(responses),
          itemMeta: itemMetaFor(pack.items),
        };

        set({
          sessions: [
            record,
            ...sessions.filter((s) => s.id !== sessionId),
          ].slice(0, MAX_SESSIONS),
        });
      },

      saveCustomPack: (pack) =>
        set((s) => ({
          customPacks: [
            pack,
            ...s.customPacks.filter((p) => p.id !== pack.id),
          ].slice(0, MAX_CUSTOM_PACKS),
        })),

      deleteCustomPack: (packId) =>
        set((s) => ({
          customPacks: s.customPacks.filter((p) => p.id !== packId),
        })),

      clearHistory: () => set({ sessions: [] }),
    }),
    {
      name: "confidently-wrong.v1",
      version: 2,
      migrate: (persisted, version) => {
        // v1 predates history and custom packs.
        const state = (persisted ?? {}) as Partial<State>;
        if (version < 2) {
          return {
            ...state,
            sessionId: state.sessionId ?? null,
            sessions: [],
            customPacks: [],
          } as unknown as State & Actions;
        }
        return persisted as State & Actions;
      },
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
  const missed = missedItems(pack, responses);
  if (!pack) return [];
  // Worth-rechecking-first: the beliefs the model is most confident are genuinely
  // held, rather than whichever miss happened to sit earliest in the pack.
  const ordered = orderByHeldBelief(missed, pack.items, probeResponses(responses));
  return ordered.map((item, i) => toVariant(item, i));
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
