"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import StudyFlow from "./StudyFlow";
import { useStudy } from "@/lib/store";

/**
 * Custom packs live in localStorage, so the pack cannot be resolved on the server.
 * This looks it up after rehydration and hands it to the same StudyFlow the
 * built-in packs use.
 */
export default function CustomStudy({ packId }: { packId: string }) {
  const hydrated = useSyncExternalStore(
    (onChange) => useStudy.persist.onFinishHydration(onChange),
    () => useStudy.persist.hasHydrated(),
    () => false,
  );

  const pack = useStudy((s) => s.customPacks.find((p) => p.id === packId));

  if (!hydrated) {
    return (
      <p className="text-sm text-ink-400" aria-live="polite">
        Loading your pack…
      </p>
    );
  }

  if (!pack) {
    return (
      <div className="rise grid gap-5">
        <h1 className="text-2xl font-semibold leading-tight text-ink-50 sm:text-3xl">
          That pack is not in this browser.
        </h1>
        <p className="text-sm leading-relaxed text-ink-300">
          Custom packs are stored locally, so they do not follow you to another
          device or survive clearing site data.
        </p>
        <Link
          href="/packs/new"
          className="w-full rounded-2xl bg-ink-50 px-6 py-4 text-center text-base font-semibold text-ink-950 transition hover:bg-[#3e4d62]"
        >
          Build a new pack
        </Link>
      </div>
    );
  }

  return <StudyFlow pack={pack} />;
}
