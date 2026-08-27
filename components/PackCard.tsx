import Link from "next/link";
import type { Pack } from "@/lib/types";

const SCENES: Record<string, { sky: string; sun: string; ridge: string; foreground: string }> = {
  seasons: { sky: "bg-[#f5bfaa]", sun: "bg-[#fff0d2]", ridge: "bg-[#8fa9ac]", foreground: "bg-[#34465f]" },
  selection: { sky: "bg-[#e8b1a7]", sun: "bg-[#f4d485]", ridge: "bg-[#d96f69]", foreground: "bg-[#45566d]" },
  chance: { sky: "bg-[#aebfce]", sun: "bg-[#f8dfb8]", ridge: "bg-[#e98b78]", foreground: "bg-[#314158]" },
};

export default function PackCard({ pack }: { pack: Pack }) {
  return (
    <Link
      href={`/study/${pack.id}`}
      className="group relative flex min-h-[24rem] flex-col overflow-hidden rounded-[2rem] border border-white/90 bg-white/75 p-3 text-ink-50 shadow-[0_16px_40px_rgba(76,66,72,.1)] backdrop-blur-xl transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_22px_48px_rgba(76,66,72,.15)]"
    >
      <Landscape id={pack.id} />
      <div className="relative flex flex-1 flex-col px-3 pb-3 pt-5">
        <div className="flex items-center justify-between text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-400">
          <span>Field pack</span><span>{String(pack.items.length).padStart(2, "0")} prompts</span>
        </div>
        <h2 className="mt-3 max-w-[15rem] text-2xl font-semibold leading-tight text-ink-50 sm:text-[1.7rem]">
          {pack.title}
        </h2>
        <p className="mt-3 flex-1 text-[0.98rem] leading-relaxed text-ink-400">
          {pack.blurb}
        </p>
        <span className="mt-6 inline-flex items-center justify-between rounded-2xl bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-950">
          Begin field study
          <span
            aria-hidden
            className="transition-transform duration-300 group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      </div>
    </Link>
  );
}

function Landscape({ id }: { id: string }) {
  const scene = SCENES[id] ?? SCENES.seasons;
  return (
    <div aria-hidden className={`relative h-48 overflow-hidden rounded-[1.45rem] ${scene.sky}`}>
      <span className={`absolute right-7 top-7 size-14 rounded-full ${scene.sun} shadow-[0_0_0_8px_rgba(255,255,255,.16)]`} />
      <span className={`absolute -bottom-16 -left-10 h-40 w-56 rotate-12 rounded-[50%] ${scene.ridge}`} />
      <span className="absolute -bottom-12 left-24 h-32 w-56 -rotate-6 rounded-[50%] bg-[#f0c8b5]" />
      <span className={`absolute -bottom-20 -right-12 h-44 w-72 -rotate-3 rounded-[50%] ${scene.foreground}`} />
      <span className="absolute bottom-8 left-9 h-20 w-1.5 bg-[#35455b] after:absolute after:-left-4 after:top-2 after:h-8 after:w-9 after:rotate-45 after:border-l-[12px] after:border-r-[12px] after:border-b-[28px] after:border-l-transparent after:border-r-transparent after:border-b-[#35455b]" />
      <span className="absolute bottom-7 right-12 h-12 w-1 bg-[#35455b] after:absolute after:-left-3 after:top-0 after:border-l-[9px] after:border-r-[9px] after:border-b-[22px] after:border-l-transparent after:border-r-transparent after:border-b-[#35455b]" />
      <span className="absolute left-8 top-7 size-2 rounded-full bg-white/80" />
      <span className="absolute left-16 top-12 size-1.5 rounded-full bg-white/70" />
    </div>
  );
}
