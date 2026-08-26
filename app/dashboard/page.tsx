import type { Metadata } from "next";
import Link from "next/link";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard · Confidently Wrong",
  description:
    "The topics you keep getting wrong, your calibration over time, and every session you have run.",
};

export default function DashboardPage() {
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-3xl px-4 pb-8 pt-5 sm:px-8 sm:pt-10 safe-b"
    >
      <nav className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-950/85 px-3 py-1.5 text-sm font-medium text-ink-200 shadow-sm transition hover:text-ink-50"
        >
          <span aria-hidden>←</span> Confidently Wrong
        </Link>
      </nav>
      <Dashboard />
    </main>
  );
}
