import Link from "next/link";
import { notFound } from "next/navigation";
import StudyFlow from "@/components/StudyFlow";
import { PACKS, getPack } from "@/lib/packs";

export function generateStaticParams() {
  return PACKS.map((p) => ({ packId: p.id }));
}

export default async function StudyPage({
  params,
}: {
  params: Promise<{ packId: string }>;
}) {
  const { packId } = await params;
  const pack = getPack(packId);
  if (!pack) notFound();

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
      <StudyFlow pack={pack} />
    </main>
  );
}
