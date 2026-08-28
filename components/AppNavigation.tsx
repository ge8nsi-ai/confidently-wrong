"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AudioLines, ChartNoAxesColumn, FilePlus2, House } from "lucide-react";
import { PACKS } from "@/lib/packs";

export default function AppNavigation() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <nav className="fixed inset-x-4 bottom-3 z-30 grid grid-cols-4 rounded-[1.35rem] border border-white/90 bg-white/88 p-1.5 shadow-[0_12px_34px_rgba(70,61,68,.16)] backdrop-blur-2xl sm:hidden" aria-label="Quick navigation">
        <Tab href="/" active={pathname === "/"} icon={<House />} label="Home" />
        <Tab href="/packs/new" active={pathname === "/packs/new"} icon={<FilePlus2 />} label="New" />
        <Tab href="/explain" active={pathname === "/explain"} icon={<AudioLines />} label="Explain" />
        <Tab href="/dashboard" active={pathname === "/dashboard"} icon={<ChartNoAxesColumn />} label="Progress" />
      </nav>
      <button
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="app-navigation"
        onClick={() => setOpen((value) => !value)}
        className="group fixed right-4 top-4 z-50 grid size-11 place-items-center rounded-full border border-white/80 bg-white/90 text-ink-50 shadow-[0_8px_24px_rgba(80,73,83,.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-white sm:right-6 sm:top-6"
      >
        <span className="sr-only">Toggle navigation</span>
        {open ? (
          <span className="relative block size-5 transition-transform duration-200 group-hover:rotate-6" aria-hidden>
            <span className="absolute left-0 top-[9px] h-0.5 w-5 rotate-45 rounded-full bg-current" />
            <span className="absolute left-0 top-[9px] h-0.5 w-5 -rotate-45 rounded-full bg-current" />
          </span>
        ) : (
          <span className="relative block h-5 w-6" aria-hidden>
            <span className="absolute left-0 top-0 h-0.5 w-6 rounded-full bg-current transition-all duration-200 group-hover:w-4" />
            <span className="absolute right-0 top-[8px] h-0.5 w-5 rounded-full bg-current transition-all duration-200 group-hover:w-6" />
            <span className="absolute left-0 top-4 h-0.5 w-4 rounded-full bg-current transition-all duration-200 group-hover:w-5" />
            <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-[#d86f63]" />
          </span>
        )}
      </button>

      <button
        type="button"
        aria-label="Close navigation"
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-[#34303a]/20 backdrop-blur-[3px] transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <aside
        id="app-navigation"
        aria-hidden={!open}
        inert={!open}
        className={`fixed right-0 top-0 z-40 flex h-dvh w-[min(86vw,22rem)] flex-col overflow-y-auto overscroll-contain bg-[#fbfaf7] px-6 pb-6 pt-24 text-ink-50 shadow-[-24px_0_60px_rgba(70,61,68,.18)] transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="border-b border-ink-700 pb-6">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-ink-400">
            Confidently Wrong
          </p>
          <p className="mt-2 max-w-[16rem] text-xl font-semibold leading-snug text-ink-50">
            Choose where to continue your field study.
          </p>
        </div>

        <nav className="mt-5 grid gap-2" aria-label="Main navigation">
          <NavLink href="/" active={pathname === "/"} number="00" title="Home" detail="All study packs" onNavigate={() => setOpen(false)} />
          {PACKS.map((pack, index) => (
            <NavLink
              key={pack.id}
              href={`/study/${pack.id}`}
              active={pathname === `/study/${pack.id}`}
              number={String(index + 1).padStart(2, "0")}
              title={pack.title}
              detail={`${pack.items.length} prompts`}
              onNavigate={() => setOpen(false)}
            />
          ))}
          <span className="mt-3 px-4 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-ink-400">
            Your study
          </span>
          <NavLink
            href="/dashboard"
            active={pathname === "/dashboard"}
            number="→"
            title="Dashboard"
            detail="Weak topics and history"
            onNavigate={() => setOpen(false)}
          />
          <NavLink
            href="/explain"
            active={pathname === "/explain"}
            number="🎙"
            title="Explain out loud"
            detail="Get marked, then quizzed on it"
            onNavigate={() => setOpen(false)}
          />
          <NavLink
            href="/packs/new"
            active={pathname === "/packs/new"}
            number="+"
            title="New pack"
            detail="From your notes or a PDF"
            onNavigate={() => setOpen(false)}
          />
        </nav>

        <p className="mt-auto border-t border-ink-700 pt-5 text-xs leading-relaxed text-ink-400">
          Progress is saved in this browser. Switching packs starts that pack from
          the beginning.
        </p>
      </aside>
    </>
  );
}

function Tab({ href, active, icon, label }: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`grid min-h-12 place-items-center rounded-2xl px-1 py-1 text-[0.62rem] font-semibold transition ${active ? "bg-[#282f40] text-white" : "text-ink-400 hover:bg-ink-900 hover:text-ink-50"}`}>
      <span className="leading-none [&>svg]:size-[18px] [&>svg]:stroke-[1.8]" aria-hidden>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function NavLink({
  href,
  active,
  number,
  title,
  detail,
  onNavigate,
}: {
  href: string;
  active: boolean;
  number: string;
  title: string;
  detail: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition ${
        active
          ? "border-ink-50 bg-ink-50 text-ink-950"
          : "border-transparent text-ink-200 hover:border-ink-700 hover:bg-ink-900"
      }`}
    >
      <span className={`tnum text-xs font-bold ${active ? "text-ember-400" : "text-ink-400"}`}>{number}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {/* The active row inverts the surface, so the detail line cannot keep the
            colour it has on a light one: ink-400 on ink-50 measures 3.9:1. */}
        <span className={`mt-0.5 block text-xs ${active ? "text-ink-600" : "text-ink-400"}`}>{detail}</span>
      </span>
      <span aria-hidden>→</span>
    </Link>
  );
}
