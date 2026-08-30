"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import BeliefPanel from "./BeliefPanel";
import CalibrationChart from "./CalibrationChart";
import PlainExplanation from "./PlainExplanation";
import ProbeCard from "./ProbeCard";
import QuadrantGrid from "./QuadrantGrid";
import RecheckSummary from "./RecheckSummary";
import RefutationCard from "./RefutationCard";
import ScorePanel from "./ScorePanel";
import {
  missedItems,
  probeResponses,
  recheckItems,
  recheckResponses,
  refutationKey,
  useStudy,
} from "@/lib/store";
import { needsRefutation } from "@/lib/scoring";
import { selectNextItem } from "@/lib/belief";
import type { Conf, Item, Pack, Refutation, Response } from "@/lib/types";

const PHASE_COPY: Record<string, string> = {
  probe: "Probe round. No feedback until the end.",
  reveal: "Results revealed.",
  repair: "Repair round.",
  recheck: "Recheck round. Reworded questions.",
  done: "Session complete.",
};

interface RepairStep {
  item: Item;
  response: Response;
  kind: "refutation" | "plain";
}

export default function StudyFlow({ pack }: { pack: Pack }) {
  const router = useRouter();
  const [repairStep, setRepairStep] = useState(0);

  // The persisted store rehydrates from localStorage after mount; wait for it so
  // the server and client first paints agree.
  const hydrated = useSyncExternalStore(
    (onChange) => useStudy.persist.onFinishHydration(onChange),
    () => useStudy.persist.hasHydrated(),
    () => false,
  );

  const phase = useStudy((s) => s.phase);
  const storedPackId = useStudy((s) => s.pack?.id);
  const index = useStudy((s) => s.index);
  const responses = useStudy((s) => s.responses);
  const refutations = useStudy((s) => s.refutations);
  const loadingRefutations = useStudy((s) => s.loadingRefutations);
  const startPack = useStudy((s) => s.startPack);
  const answer = useStudy((s) => s.answer);
  const setPhase = useStudy((s) => s.setPhase);
  const setRefutation = useStudy((s) => s.setRefutation);
  const setLoadingRefutations = useStudy((s) => s.setLoadingRefutations);
  const reset = useStudy((s) => s.reset);

  useEffect(() => {
    if (!hydrated) return;
    if (storedPackId !== pack.id || phase === "pick") startPack(pack);
  }, [hydrated, pack, phase, startPack, storedPackId]);

  const probe = useMemo(() => probeResponses(responses), [responses]);
  const recheck = useMemo(() => recheckResponses(responses), [responses]);

  /**
   * The probe order is chosen live rather than fixed: the next question is the one
   * the belief model can least predict the answer to. Every item is still asked
   * exactly once, so the store's progress counting is untouched — the fallback to
   * pack order covers the moment the round is already complete.
   */
  const probeItem = useMemo(
    () =>
      selectNextItem(pack.items, probe) ??
      pack.items[Math.min(index, pack.items.length - 1)]!,
    [index, pack.items, probe],
  );

  const repairSteps = useMemo<RepairStep[]>(() => {
    const missed = missedItems(pack, responses);
    const byId = new Map(probe.map((r) => [r.itemId, r]));
    const steps: RepairStep[] = [];
    for (const item of missed) {
      const response = byId.get(item.id);
      if (!response) continue;
      steps.push({
        item,
        response,
        // The gating rule: a personalised refutation only for beliefs actually held.
        kind: needsRefutation(response) ? "refutation" : "plain",
      });
    }
    return [
      ...steps.filter((s) => s.kind === "refutation"),
      ...steps.filter((s) => s.kind === "plain"),
    ];
  }, [pack, probe, responses]);

  const fetchedRef = useRef(false);
  const fetchRefutations = useCallback(async () => {
    const targets = repairSteps.filter((s) => s.kind === "refutation");
    if (targets.length === 0) return;
    setLoadingRefutations(true);
    await Promise.all(
      targets.map(async (step) => {
        const key = refutationKey(step.item.id, step.response.chosenOptionId);
        if (useStudy.getState().refutations[key]) return;
        const chosen = step.item.options.find(
          (o) => o.id === step.response.chosenOptionId,
        );
        const correct = step.item.options.find((o) => o.correct);
        const fallback = step.item.fallbackRefutation;
        try {
          const res = await fetch("/api/refute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId: step.item.id,
              chosenOptionId: step.response.chosenOptionId,
              stem: step.item.stem,
              chosenOptionText: chosen?.text ?? "",
              misconception: chosen?.misconception ?? "",
              correctOptionText: correct?.text ?? "",
              fallbackRefutation: fallback,
            }),
          });
          const data = (await res.json()) as { refutation?: Refutation };
          setRefutation(key, data.refutation ?? fallback);
        } catch {
          setRefutation(key, fallback);
        }
      }),
    );
    setLoadingRefutations(false);
  }, [repairSteps, setLoadingRefutations, setRefutation]);

  /**
   * Refutations are fetched when the reveal screen opens, not when repair does.
   *
   * They were only ever needed by the next screen, so they used to be asked for at
   * the moment the learner arrived there and read as a wait. The probe round is
   * over by the time reveal renders, so every refutation the repair round will want
   * is already known: the quadrant chart is the paid calls' cover, and the round
   * that follows opens with its text already in the store.
   */
  useEffect(() => {
    if ((phase !== "reveal" && phase !== "repair") || fetchedRef.current) return;
    fetchedRef.current = true;
    void fetchRefutations();
  }, [fetchRefutations, phase]);

  const onSubmit = useCallback(
    (item: Item) => (chosenOptionId: string, conf: Conf) =>
      answer(item, chosenOptionId, conf),
    [answer],
  );

  if (!hydrated || storedPackId !== pack.id) {
    return (
      <p className="text-sm text-ink-400" aria-live="polite">
        Loading {pack.title}…
      </p>
    );
  }

  const recheckList = recheckItems(pack, responses);

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {PHASE_COPY[phase] ?? ""}
      </p>

      {phase === "probe" ? (
        <ProbeCard
          key={probeItem.id}
          item={probeItem}
          position={index + 1}
          total={pack.items.length}
          round="probe"
          onSubmit={onSubmit(probeItem)}
        />
      ) : null}

      {phase === "reveal" ? (
        <div className="rise grid gap-9">
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">
              {pack.title}
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-ink-50 sm:text-4xl">
              Here is what you were sure about.
            </h1>
          </header>
          <QuadrantGrid responses={probe} />
          <CalibrationChart responses={probe} />
          <BeliefPanel items={pack.items} responses={probe} />
          <ScorePanel responses={probe} />
          <button
            type="button"
            onClick={() => {
              setRepairStep(0);
              setPhase("repair");
            }}
            className="w-full rounded-2xl bg-ink-50 px-6 py-4 text-base font-semibold text-ink-950 transition hover:bg-[#30384a]"
          >
            {repairSteps.length === 0
              ? "Nothing to repair — continue"
              : `Repair ${repairSteps.length} belief${repairSteps.length === 1 ? "" : "s"}`}
          </button>
        </div>
      ) : null}

      {phase === "repair" ? (
        <RepairView
          steps={repairSteps}
          step={repairStep}
          refutations={refutations}
          loading={loadingRefutations}
          onBack={() => setRepairStep((s) => Math.max(0, s - 1))}
          onNext={() => setRepairStep((s) => s + 1)}
          onFinish={() =>
            setPhase(recheckList.length > 0 ? "recheck" : "done")
          }
          recheckCount={recheckList.length}
        />
      ) : null}

      {phase === "recheck" && recheckList.length > 0 ? (
        <ProbeCard
          key={recheckList[Math.min(index, recheckList.length - 1)]!.id}
          item={recheckList[Math.min(index, recheckList.length - 1)]!}
          position={Math.min(index, recheckList.length - 1) + 1}
          total={recheckList.length}
          round="recheck"
          onSubmit={onSubmit(recheckList[Math.min(index, recheckList.length - 1)]!)}
        />
      ) : null}

      {phase === "done" || (phase === "recheck" && recheckList.length === 0) ? (
        <RecheckSummary
          before={probe}
          after={recheck}
          onRestart={() => {
            reset();
            router.push("/");
          }}
        />
      ) : null}
    </>
  );
}

function RepairView({
  steps,
  step,
  refutations,
  loading,
  onBack,
  onNext,
  onFinish,
  recheckCount,
}: {
  steps: RepairStep[];
  step: number;
  refutations: Record<string, Refutation>;
  loading: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  recheckCount: number;
}) {
  if (steps.length === 0) {
    return (
      <div className="rise grid gap-6">
        <h1 className="text-3xl font-semibold leading-tight text-ink-50">
          Nothing to repair.
        </h1>
        <p className="text-base leading-relaxed text-ink-300">
          You answered every question correctly, so there is no belief to correct.
        </p>
        <button
          type="button"
          onClick={onFinish}
          className="w-full rounded-2xl bg-ink-50 px-6 py-4 text-base font-semibold text-ink-950 transition hover:bg-[#30384a]"
        >
          Continue
        </button>
      </div>
    );
  }

  const current = steps[Math.min(step, steps.length - 1)]!;
  const isLast = step >= steps.length - 1;
  const key = refutationKey(current.item.id, current.response.chosenOptionId);

  return (
    <div className="grid gap-6">
      <header>
        <p className="tnum text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">
          Repair · {Math.min(step, steps.length - 1) + 1} of {steps.length}
        </p>
        <h1 className="mt-3 text-2xl font-semibold leading-tight text-ink-50 sm:text-3xl">
          {current.kind === "refutation"
            ? "A belief you held with certainty"
            : "A gap you already knew you had"}
        </h1>
      </header>

      {current.kind === "refutation" ? (
        <RefutationCard
          key={key}
          stem={current.item.stem}
          conf={current.response.conf}
          refutation={refutations[key] ?? null}
          loading={loading && !refutations[key]}
        />
      ) : (
        <PlainExplanation key={current.item.id} item={current.item} />
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={step === 0}
          className="rounded-2xl border border-ink-600/70 px-5 py-3.5 text-sm font-semibold text-ink-200 transition hover:border-ink-400 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-ink-400"
        >
          Back
        </button>
        <button
          type="button"
          onClick={isLast ? onFinish : onNext}
          className="flex-1 rounded-2xl bg-ink-50 px-6 py-3.5 text-base font-semibold text-ink-950 transition hover:bg-[#30384a]"
        >
          {isLast
            ? recheckCount > 0
              ? `Recheck ${recheckCount} question${recheckCount === 1 ? "" : "s"}`
              : "Finish"
            : "Next"}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-ink-400">
        Refutations are written only for answers you were sure about. Wrong answers
        you flagged as guesses get a plain statement of the answer instead.
      </p>
    </div>
  );
}
