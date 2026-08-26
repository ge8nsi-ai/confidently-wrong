"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="app-navigation"
        onClick={() => setOpen((value) => !value)}
        className="fixed right-4 top-4 z-50 grid size-11 place-items-center rounded-2xl bg-ink-50 text-ink-950 shadow-[0_8px_24px_rgba(50,58,76,.24)] transition hover:-translate-y-0.5 sm:right-6 sm:top-6"
      >
        <span className="relative block h-4 w-5" aria-hidden>
          <span className={`absolute left-0 top-0 h-0.5 w-5 rounded bg-current transition ${open ? "translate-y-[7px] rotate-45" : ""}`} />
          <span className={`absolute left-0 top-[7px] h-0.5 w-5 rounded bg-current transition ${open ? "opacity-0" : ""}`} />
          <span className={`absolute left-0 top-[14px] h-0.5 w-5 rounded bg-current transition ${open ? "-translate-y-[7px] -rotate-45" : ""}`} />
        </span>
      </button>

      <button
        type="button"
        aria-label="Close navigation"
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-[#273447]/25 backdrop-blur-[2px] transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <aside
        id="app-navigation"
        aria-hidden={!open}
        inert={!open}
        className={`fixed right-0 top-0 z-40 flex h-dvh w-[min(86vw,22rem)] flex-col bg-[#fffaf3] px-6 pb-6 pt-24 shadow-[-24px_0_60px_rgba(68,48,58,.18)] transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
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
          : "border-transparent text-ink-200 hover:border-ink-700 hover:bg-ink-850"
      }`}
    >
      <span className={`tnum text-xs font-bold ${active ? "text-ember-300" : "text-ink-400"}`}>{number}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className={`mt-0.5 block text-xs ${active ? "text-ink-600" : "text-ink-400"}`}>{detail}</span>
      </span>
      <span aria-hidden>→</span>
    </Link>
  );
}
