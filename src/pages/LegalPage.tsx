import { ArrowLeft, ChevronRight, FileText } from "lucide-react";
import { Markdown } from "../components/Markdown";
import { LEGAL_DOCS, legalDoc } from "../lib/legal";

interface Props {
  /** Document slug, or null to show the list of documents. */
  slug: string | null;
  onOpen: (slug: string | null) => void;
  onBack: () => void;
}

/** Terms and policies. Reads the markdown in docs/legal, so the app and the repo always match. */
export function LegalPage({ slug, onOpen, onBack }: Props) {
  const doc = slug ? legalDoc(slug) : undefined;

  return (
    <div className="animate-rise min-w-0 pb-10">
      <div className="sticky top-0 z-20 -mx-4 flex h-14 items-center gap-3 bg-bg/85 px-4 backdrop-blur-xl sm:-mx-5 sm:px-5">
        <button onClick={doc ? () => onOpen(null) : onBack} aria-label={doc ? "Back to policies" : "Back to profile"} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fill transition active:scale-95">
          <ArrowLeft size={20} />
        </button>
        <p className="min-w-0 truncate text-[14px] font-semibold text-muted">{doc ? doc.title : "Terms and policies"}</p>
      </div>

      {!doc && (
        <section className="pt-4">
          <h1 className="text-[28px] font-bold tracking-tight">Terms and policies</h1>
          <p className="mt-1 text-[15px] text-muted">Read how FLUX works, how refunds are handled and how your data is used.</p>
          <div className="card mt-6 divide-y divide-line overflow-hidden">
            {LEGAL_DOCS.map((d) => (
              <button key={d.slug} onClick={() => onOpen(d.slug)} className="flex w-full items-center gap-3.5 px-4 py-4 text-left transition hover:bg-fill/60 active:bg-fill">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fill"><FileText size={18} /></span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[15px] font-semibold">{d.title}</b>
                  <span className="block text-[13px] text-muted">{d.summary}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </button>
            ))}
          </div>
        </section>
      )}

      {doc && (
        <div className="pt-4">
          <Markdown source={doc.source} onOpenDoc={(s) => onOpen(s)} />
        </div>
      )}
    </div>
  );
}
