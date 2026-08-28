import Image from "next/image";
import Link from "next/link";
import PackCard from "@/components/PackCard";
import { PACKS } from "@/lib/packs";

const features = [
  ["01", "Probe", "Answer first. No hints, no peeking."],
  ["02", "Calibrate", "Say how certain you feel."],
  ["03", "Repair", "Fix only the beliefs you backed."],
];

export default function Home() {
  return (
    <main id="main" className="min-h-dvh overflow-hidden safe-b">
      <section className="mx-auto max-w-6xl px-5 pb-14 pt-6 sm:px-8 sm:pb-20 sm:pt-10 lg:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-3 text-ink-50">
            <span className="relative grid size-10 place-items-center overflow-hidden rounded-[0.9rem] bg-[#17243a] shadow-sm"><Image src="/generated/confidently-wrong-logo.webp" alt="" fill sizes="40px" className="object-cover" /></span>
            <span className="text-sm font-bold tracking-[-0.02em]">Confidently Wrong</span>
          </Link>
          <Link href="/dashboard" className="hidden rounded-full bg-ink-50 px-4 py-2.5 text-xs font-bold text-ink-950 transition hover:bg-[#30384a] hover:text-ink-950 sm:block">Your progress <span aria-hidden>↗</span></Link>
        </header>

        <div className="mt-10 grid items-center gap-10 lg:mt-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-16">
          <div className="rise order-2 lg:order-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9e766d]">A gentler way to learn</p>
            <h1 className="mt-4 max-w-2xl text-[3.2rem] font-semibold leading-[0.96] tracking-[-0.06em] text-ink-50 sm:text-6xl lg:text-[5.2rem]">Study the things you&apos;re <span className="text-[#b86c5f]">sure</span> about.</h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-ink-300 sm:text-lg">A short, private learning loop that finds the ideas you missed with confidence — then helps them stick.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/study/seasons" className="inline-flex min-h-14 items-center justify-between rounded-2xl bg-ink-50 px-5 text-sm font-bold text-ink-950 shadow-[0_5px_0_#c2bcb0] transition hover:-translate-y-0.5 hover:bg-[#30384a] hover:text-ink-950">Try a sample pack <span aria-hidden>→</span></Link><Link href="/packs/new" className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-ink-600 bg-white/45 px-5 text-sm font-semibold text-ink-200 transition hover:border-ink-300 hover:bg-white">Make your own</Link></div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-ink-400"><span>Private by default</span><span>•</span><span>No account needed</span><span>•</span><span>AI optional</span></div>
          </div>

          <div className="relative order-1 mx-auto w-full max-w-[31rem] lg:order-2 lg:max-w-none">
            <div className="absolute -inset-4 rounded-[2.6rem] bg-[#e7c7c1]/60 blur-[1px]" />
            <div className="relative overflow-hidden rounded-[2.25rem] border border-white/80 bg-white/75 p-3 shadow-[0_25px_60px_rgba(81,69,76,.15)] backdrop-blur-xl">
              <div className="relative aspect-[0.92] overflow-hidden rounded-[1.7rem] bg-[#d7e0ed]"><Image src="/generated/belief-map-hero.webp" alt="Illustrated map of ideas and learning paths" fill priority sizes="(max-width: 1024px) 90vw, 42vw" className="object-cover" /></div>
              <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-[#20293b]/92 px-4 py-3 text-white shadow-lg"><div className="flex items-center justify-between"><div><p className="text-sm font-bold">Your belief map</p><p className="mt-0.5 text-xs text-[#cad5e6]">4 ideas worth a second look</p></div><span className="grid size-10 place-items-center rounded-full bg-[#f2b2a1] text-sm font-bold text-[#283247]">4</span></div></div>
            </div>
            <span className="absolute -right-2 top-8 rounded-full bg-[#b8d77a] px-3 py-2 text-[0.68rem] font-bold text-[#273247] shadow-md sm:-right-4">small steps, big clarity</span>
          </div>
        </div>
      </section>

      <section className="border-y border-[#d6d1ca] bg-white/60"><div className="mx-auto grid max-w-6xl divide-y divide-[#dedad3] px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-8 lg:px-10">{features.map(([number, title, detail]) => <div key={number} className="flex gap-4 px-1 py-6 sm:block sm:px-6 sm:py-8"><span className="tnum text-xs font-bold text-[#a77b70]">{number}</span><div><h2 className="sm:mt-4 text-base font-bold text-ink-50">{title}</h2><p className="mt-1 text-sm leading-relaxed text-ink-400">{detail}</p></div></div>)}</div></section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:px-10 lg:py-24" aria-labelledby="packs-heading"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9e766d]">Start here</p><h2 id="packs-heading" className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-ink-50 sm:text-5xl">A few good places to be wrong.</h2></div><p className="max-w-sm text-sm leading-relaxed text-ink-400">Short packs built around the misconceptions that survive ordinary studying.</p></div><div className="mt-8 grid gap-5 md:grid-cols-3">{PACKS.map((pack) => <PackCard key={pack.id} pack={pack} />)}</div></section>

      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 lg:px-10 lg:pb-24"><div className="grid overflow-hidden rounded-[2rem] bg-[#262f43] shadow-[0_20px_50px_rgba(50,46,55,.15)] lg:grid-cols-[1.05fr_.95fr]"><div className="p-7 sm:p-10 lg:p-14"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f2b2a1]">Make it yours</p><h2 className="mt-4 max-w-lg text-3xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-5xl">Your notes. Your voice. Your blind spots.</h2><p className="mt-5 max-w-lg leading-relaxed text-[#cbd4df]">Bring a PDF, paste your notes, or explain a topic out loud. The app turns your own material into a calm, focused practice loop.</p></div><div className="grid gap-3 bg-[#e4eccf] p-5 sm:p-8"><Action href="/packs/new" label="Build a pack" detail="From notes or a PDF" /><Action href="/explain" label="Explain aloud" detail="Find gaps in your own words" /><Action href="/dashboard" label="Open dashboard" detail="See your learning pattern" /></div></div></section>

      <footer className="border-t border-[#d6d1ca] px-5 py-8 text-xs text-ink-400 sm:px-8 lg:px-10"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 sm:flex-row"><span>Confidently Wrong</span><span>Nothing stored on a server.</span></div></footer>
    </main>
  );
}

function Action({ href, label, detail }: { href: string; label: string; detail: string }) { return <Link href={href} className="group flex items-center gap-4 rounded-2xl border border-[#273247]/15 bg-white/65 p-4 transition hover:-translate-y-0.5 hover:bg-white"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#273247] text-lg text-[#e4eccf]">↗</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#273247]">{label}</span><span className="mt-1 block text-xs text-[#58666a]">{detail}</span></span><span className="text-[#273247] transition-transform group-hover:translate-x-1" aria-hidden>→</span></Link>; }
