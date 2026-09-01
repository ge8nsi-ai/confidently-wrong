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
import { refuteBody } from "@/lib/refutation";
import { selectNextItem, type PriorSource } from "@/lib/belief";
import { priorFrom, recall, recallSentence } from "@/lib/memory";
import {
  MAX_BATCH_FAILURES,
  avoidList,
  canExtend,
  extendedTarget,
  indexOffsetFor,
  nextBatchSize,
  progressLabel,
  targetOf,
} from "@/lib/endless";
import type { Conf, Item, Pack, Refutation, Response } from "@/lib/types";

const PHASE_COPY: Record<string, string> = {
  probe: "Probe round. No feedback until the end.",
  reveal: "Results revealed.",
  repair: "Repair round.",
  recheck: "Recheck round. Reworded questions.",
  done: "Session complete.",
};

/**
 * One clock for every "how long ago" this flow shows.
 *
 * Read when the module loads rather than during render, for two reasons. A component
 * that reads the wall clock while rendering answers differently on every re-render,
 * and the decayed weight of a remembered belief has to agree with the sentence that
 * explains it. The coarsest thing either of them ever says is "3 weeks ago", so a
 * clock a few minutes stale changes nothing.
 */
const LOADED_AT = Date.now();

interface RepairStep {
  item: Item;
  response: Response;
  kind: "refutation" | "plain";
  /** "You held this belief three weeks ago too", when history says so. */
  recall: string | null;
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
  const sessions = useStudy((s) => s.sessions);
  const sessionId = useStudy((s) => s.sessionId);
  const startPack = useStudy((s) => s.startPack);
  const answer = useStudy((s) => s.answer);
  const setPhase = useStudy((s) => s.setPhase);
  const setRefutation = useStudy((s) => s.setRefutation);
  const setLoadingRefutations = useStudy((s) => s.setLoadingRefutations);
  const appendItems = useStudy((s) => s.appendItems);
  const setTarget = useStudy((s) => s.setTarget);
  const reset = useStudy((s) => s.reset);

  useEffect(() => {
    if (!hydrated) return;
    if (storedPackId !== pack.id || phase === "pick") startPack(pack);
  }, [hydrated, pack, phase, startPack, storedPackId]);

  const probe = useMemo(() => probeResponses(responses), [responses]);
  const recheck = useMemo(() => recheckResponses(responses), [responses]);

  /**
   * What earlier sessions concluded about these concepts.
   *
   * The run being played is excluded, so a session never primes itself. History is
   * read once here and used for three things: where the probe round starts, which
   * misses are rechecked first, and whether a repaired belief can be named as one
   * the learner has held before.
   */
  const recalled = useMemo(
    () => recall(sessions, { exclude: sessionId, now: LOADED_AT }),
    [sessionId, sessions],
  );
  const prior = useMemo<PriorSource>(
    () => (conceptId, keys) => priorFrom(recalled.get(conceptId), keys),
    [recalled],
  );

  /**
   * The probe order is chosen live rather than fixed: the next question is the one
   * the belief model can least predict the answer to. Every item is still asked
   * exactly once, so the store's progress counting is untouched.
   *
   * In an endless pack there may be nothing to fall back to: the list is only what
   * has arrived, so null here means a batch is still being written, not that the
   * round is over.
   */
  const probeItem = useMemo(() => {
    const next = selectNextItem(pack.items, probe, prior);
    if (next) return next;
    if (pack.endless) return null;
    return pack.items[Math.min(index, pack.items.length - 1)]!;
  }, [index, pack.endless, pack.items, prior, probe]);

  const repairSteps = useMemo<RepairStep[]>(() => {
    const missed = missedItems(pack, responses);
    const byId = new Map(probe.map((r) => [r.itemId, r]));
    const steps: RepairStep[] = [];
    for (const item of missed) {
      const response = byId.get(item.id);
      if (!response) continue;
      const key = item.options
        .find((o) => o.id === response.chosenOptionId)
        ?.misconception?.trim();
      steps.push({
        item,
        response,
        // The gating rule: a personalised refutation only for beliefs actually held.
        kind: needsRefutation(response) ? "refutation" : "plain",
        // Stated by the app, from its own records. The model is never told what
        // happened in an earlier session, because it cannot check it.
        recall: key
          ? recallSentence(recalled.get(item.conceptId), key, LOADED_AT)
          : null,
      });
    }
    return [
      ...steps.filter((s) => s.kind === "refutation"),
      ...steps.filter((s) => s.kind === "plain"),
    ];
  }, [pack, probe, recalled, responses]);

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
            // refuteBody picks the passages of the learner's material that speak to
            // this belief and fits them to the route's 4KB cap. It measured this exact
            // object, so it is sent as it is rather than spread into a bigger one.
            body: JSON.stringify(
              refuteBody({
                itemId: step.item.id,
                chosenOptionId: step.response.chosenOptionId,
                stem: step.item.stem,
                chosenOptionText: chosen?.text ?? "",
                misconception: chosen?.misconception ?? "",
                correctOptionText: correct?.text ?? "",
                fallbackRefutation: fallback,
                style: "direct",
                material: pack.material,
              }),
            ),
          });
          const data = (await res.json()) as { refutation?: Refutation };
          setRefutation(key, data.refutation ?? fallback);
        } catch {
          setRefutation(key, fallback);
        }
      }),
    );
    setLoadingRefutations(false);
  }, [pack.material, repairSteps, setLoadingRefutations, setRefutation]);

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

  /**
   * The next batch of endless questions, written while the learner answers.
   *
   * Kept in a ref rather than in state because it must not re-render anything: the
   * point of the batch is that the learner never sees it happen. `inFlight` guards
   * against the effect firing twice for one gap, and `failures` stops the loop
   * asking again forever when the route is down or rate-limiting.
   *
   * Deliberately not aborted on cleanup. This effect re-runs on every answer, so an
   * abort there would cancel the very batch the answer was buying time for. A batch
   * that lands late is still wanted, and it is written to the store rather than to
   * component state, so nothing depends on this component still being mounted.
   */
  const batch = useRef({ inFlight: false, failures: 0 });
  const [batchError, setBatchError] = useState("");

  useEffect(() => {
    if (phase !== "probe" || !pack.endless || !pack.material) return;
    const want = nextBatchSize(pack, responses, batch.current);
    if (want === 0) return;

    batch.current.inFlight = true;
    void (async () => {
      try {
        const res = await fetch("/api/more-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: pack.material,
            packId: pack.title,
            count: want,
            // Everything asked so far, so a later batch does not repeat it.
            avoid: avoidList(pack.items),
            indexOffset: indexOffsetFor(pack),
          }),
        });
        const data = (await res.json()) as { items?: Item[]; error?: string };
        if (!res.ok || !data.items || data.items.length === 0) {
          batch.current.failures += 1;
          // Only worth saying once the learner could actually run dry.
          if (batch.current.failures >= MAX_BATCH_FAILURES) {
            setBatchError(
              data.error ??
                "No more questions could be written from this material. Finish whenever you like.",
            );
          }
          return;
        }
        batch.current.failures = 0;
        setBatchError("");
        appendItems(data.items);
      } catch {
        batch.current.failures += 1;
      } finally {
        batch.current.inFlight = false;
      }
    })();
  }, [appendItems, pack, phase, responses]);

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

  const recheckList = recheckItems(pack, responses, prior);

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {PHASE_COPY[phase] ?? ""}
      </p>

      {phase === "probe" ? (
        <div className="grid gap-6">
          {probeItem ? (
            <ProbeCard
              key={probeItem.id}
              item={probeItem}
              position={pack.endless ? probe.length + 1 : index + 1}
              total={pack.endless ? targetOf(pack) : pack.items.length}
              round="probe"
              onSubmit={onSubmit(probeItem)}
            />
          ) : (
            <div className="rise grid gap-3 rounded-2xl border border-ink-700 p-6">
              <p className="tnum text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">
                {progressLabel(pack, probe.length)}
              </p>
              <p className="text-base leading-relaxed text-ink-200" aria-live="polite">
                {batchError
                  ? batchError
                  : "Writing the next questions from your material. A few seconds."}
              </p>
            </div>
          )}

          {pack.endless ? (
            <EndlessControls
              answered={probe.length}
              target={targetOf(pack)}
              canExtend={canExtend(pack)}
              error={probeItem ? batchError : ""}
              onExtend={() => setTarget(extendedTarget(pack))}
              onFinish={() => setPhase("reveal")}
            />
          ) : null}
        </div>
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
          <BeliefPanel items={pack.items} responses={probe} prior={prior} />
          <ScorePanel responses={probe} />
          {pack.endless && canExtend(pack) ? (
            <button
              type="button"
              onClick={() => {
                setTarget(extendedTarget(pack));
                setPhase("probe");
              }}
              className="w-full rounded-2xl border border-ink-600/70 px-6 py-3.5 text-sm font-semibold text-ink-200 transition hover:border-ink-400"
            >
              Answer {extendedTarget(pack) - targetOf(pack)} more before repairing
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setRepairStep(0);
              setPhase("repair");
            }}
            className="w-full rounded-2xl bg-ink-50 px-6 py-4 text-base font-semibold text-ink-950 transition hover:bg-[#30384a]"
          >
            {repairSteps.length === 0
              ? "Nothing to repair, continue"
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
          items={pack.items}
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

/**
 * The two things an endless round needs that a fixed pack does not: a way to stop
 * whenever the learner has had enough, and a way to ask for more than they first
 * said. Stopping is always available, because a round with no last question is
 * otherwise a round you cannot leave.
 */
function EndlessControls({
  answered,
  target,
  canExtend: extendable,
  error,
  onExtend,
  onFinish,
}: {
  answered: number;
  target: number;
  canExtend: boolean;
  error: string;
  onExtend: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="grid gap-3">
      {error ? (
        <p className="text-xs leading-relaxed text-amber-300/90" aria-live="polite">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onFinish}
          disabled={answered === 0}
          className="rounded-2xl border border-ink-600/70 px-5 py-3 text-sm font-semibold text-ink-200 transition hover:border-ink-400 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-ink-400"
        >
          Finish and see results
        </button>
        {extendable ? (
          <button
            type="button"
            onClick={onExtend}
            className="rounded-2xl border border-ink-600/70 px-5 py-3 text-sm font-semibold text-ink-200 transition hover:border-ink-400"
          >
            Keep going past {target}
          </button>
        ) : null}
      </div>
      <p className="tnum text-xs leading-relaxed text-ink-400">
        {answered} answered of {target}. Questions are written while you answer.
      </p>
    </div>
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
        {/*
          Said by the app from its own stored records, not by the model. A model
          asked to remember July would invent it, and being wrong about what the
          learner used to believe is worse than saying nothing.
        */}
        {current.recall ? (
          <p className="mt-3 text-sm leading-relaxed text-amber-300/90">
            {current.recall}
          </p>
        ) : null}
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
