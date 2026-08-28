import Link from "next/link";
import type { CSSProperties } from "react";
import type { Pack } from "@/lib/types";

const SCENES: Record<
  string,
  { sky: string; sun: string; ridge: string; foreground: string }
> = {
  seasons: { sky: "#f5bfaa", sun: "#fff0d2", ridge: "#8fa9ac", foreground: "#34465f" },
  selection: { sky: "#e8b1a7", sun: "#f4d485", ridge: "#d96f69", foreground: "#45566d" },
  chance: { sky: "#aebfce", sun: "#f8dfb8", ridge: "#e98b78", foreground: "#314158" },
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

/**
 * SVG cannot put a percentage in its own transform attribute, and a CSS
 * transform overrides that attribute, so a shape anchored to the right edge has
 * to take its nudge and its tilt from the same place: CSS.
 */
function placed(dx: number, deg: number): CSSProperties {
  return {
    transformBox: "fill-box",
    transformOrigin: "center",
    transform: `translateX(${dx}px) rotate(${deg}deg)`,
  };
}

/**
 * Decorative. One SVG rather than a stack of absolutely-positioned divs: the
 * hills are ellipses far larger than the frame, and as divs their layout boxes
 * reached down over the card's text. Nothing showed — overflow-hidden clipped
 * the paint — but axe measures contrast from rectangles, not from what is
 * painted, so it read the meta line as grey-on-navy and failed it at 1.78:1.
 * A shape inside an SVG has no background colour to be mistaken for one.
 */
function Landscape({ id }: { id: string }) {
  const scene = SCENES[id] ?? SCENES.seasons;
  return (
    <div className="relative h-48 overflow-hidden rounded-[1.45rem]">
      <svg aria-hidden className="absolute inset-0 size-full">
        <rect width="100%" height="100%" fill={scene.sky} />
        <circle cx="36" cy="32" r="4" fill="rgba(255,255,255,.8)" />
        <circle cx="70" cy="54" r="3" fill="rgba(255,255,255,.7)" />
        <circle cx="100%" cy="56" r="36" fill="rgba(255,255,255,.16)" style={placed(-56, 0)} />
        <circle cx="100%" cy="56" r="28" fill={scene.sun} style={placed(-56, 0)} />
        <ellipse cx="72" cy="176" rx="112" ry="80" fill={scene.ridge} style={placed(0, 12)} />
        <ellipse cx="208" cy="176" rx="112" ry="64" fill="#f0c8b5" style={placed(0, -6)} />
        <ellipse cx="100%" cy="184" rx="144" ry="88" fill={scene.foreground} style={placed(-96, -3)} />
        <rect x="36" y="108" width="6" height="52" fill="#35455b" />
        <polygon points="14,118 39,82 64,118" fill="#35455b" />
        <polygon points="21,96 39,66 57,96" fill="#35455b" />
      </svg>
    </div>
  );
}
