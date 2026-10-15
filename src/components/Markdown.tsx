import { Fragment, type ReactNode } from "react";
import { fillPlaceholders } from "../lib/legal";

/**
 * Small, safe markdown renderer for our own legal documents. It supports headings, paragraphs,
 * bullet and numbered lists, tables, rules, bold text and links. Nothing is rendered as raw HTML.
 */
type Block =
  | { kind: "h1" | "h2" | "h3" | "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "hr" };

function parse(source: string): Block[] {
  const lines = fillPlaceholders(source).replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ kind: "p", text: para.join(" ") }); para = []; } };
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    if (trimmed === "---") { flush(); blocks.push({ kind: "hr" }); continue; }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) { flush(); blocks.push({ kind: (["h1", "h2", "h3"] as const)[heading[1].length - 1], text: heading[2] }); continue; }
    if (trimmed.startsWith("|") && lines[i + 1]?.trim().startsWith("|") && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flush();
      const head = cells(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(cells(lines[i])); i++; }
      i--;
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, "")); i++; }
      i--;
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s+/, "")); i++; }
      i--;
      blocks.push({ kind: "ol", items });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}

/** Inline: **bold** and [label](target). Links to other legal documents are routed inside the app. */
function inline(text: string, onOpenDoc: (file: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    if (m[1]) out.push(<strong key={key++} className="font-semibold text-ink">{m[1]}</strong>);
    else {
      const target = m[3];
      const isDoc = target.endsWith(".md") && !target.includes("://");
      out.push(isDoc
        ? <button key={key++} onClick={() => onOpenDoc(target.replace(/\.md$/, ""))} className="font-semibold text-brand underline-offset-2 hover:underline">{m[2]}</button>
        : <a key={key++} href={target} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline-offset-2 hover:underline">{m[2]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return out;
}

export function Markdown({ source, onOpenDoc }: { source: string; onOpenDoc: (slug: string) => void }) {
  const blocks = parse(source);
  return (
    <article className="min-w-0 break-words text-[15px] leading-[1.7] text-ink/85">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h1": return <h1 key={i} className="mb-2 text-[26px] font-bold leading-tight tracking-tight text-ink">{inline(b.text, onOpenDoc)}</h1>;
          case "h2": return <h2 key={i} className="mb-2 mt-9 text-[18px] font-bold tracking-tight text-ink">{inline(b.text, onOpenDoc)}</h2>;
          case "h3": return <h3 key={i} className="mb-1 mt-5 text-[15px] font-semibold text-ink">{inline(b.text, onOpenDoc)}</h3>;
          case "p": return <p key={i} className="my-3">{inline(b.text, onOpenDoc)}</p>;
          case "ul": return <ul key={i} className="my-3 list-disc space-y-2 pl-5 marker:text-muted">{b.items.map((t, j) => <li key={j}>{inline(t, onOpenDoc)}</li>)}</ul>;
          case "ol": return <ol key={i} className="my-3 list-decimal space-y-2 pl-5 marker:text-muted">{b.items.map((t, j) => <li key={j}>{inline(t, onOpenDoc)}</li>)}</ol>;
          case "hr": return <hr key={i} className="my-8 border-line" />;
          case "table": return (
            <div key={i} className="scroll-x my-4 overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
                <thead className="bg-fill">
                  <tr>{b.head.map((h, j) => <th key={j} className="px-3 py-2.5 font-semibold text-ink">{inline(h, onOpenDoc)}</th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j} className="border-t border-line align-top">
                      {r.map((c, k) => <td key={k} className="px-3 py-2.5">{inline(c, onOpenDoc)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
      })}
    </article>
  );
}
