import { useMemo, useState } from "react";
import { PackageSearch, Search } from "lucide-react";
import { AdSlot, PlanCard } from "../components/Blocks";
import { Empty, Skeleton } from "../components/ui";
import type { Product } from "../lib/types";

interface Props {
  products: Product[] | null; productsLoading: boolean; productsError: string | null;
  onBuy: (p: Product) => void; onRetry: () => void;
}

export function Shop({ products, productsLoading, productsError, onBuy, onRetry }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const categories = useMemo(() => ["All", "Popular", ...Array.from(new Set((products ?? []).map((p) => p.category)))], [products]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      const inCat = category === "All" || (category === "Popular" ? ["Popular", "Trending"].includes(p.tag ?? "") : p.category === category);
      return inCat && (!q || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q));
    });
  }, [products, category, query]);

  return (
    <div className="animate-rise">
      <section className="pb-5 pt-5">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">Shop</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">Every subscription in one place.</p>
      </section>

      <label className="mb-3 flex h-12 items-center gap-2.5 rounded-full bg-fill px-4 text-muted focus-within:ring-2 focus-within:ring-brand">
        <Search size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subscriptions" className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted" />
      </label>
      <div className="scroll-x -mx-4 sm:-mx-5 mb-5 flex gap-2 overflow-x-auto px-4 sm:px-5">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition ${category === c ? "bg-ink text-bg" : "bg-fill text-ink"}`}>{c}</button>
        ))}
      </div>

      <AdSlot placement="shop" />

      {productsLoading ? <div className="grid min-w-0 grid-cols-2 gap-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="min-w-0 overflow-hidden rounded-[18px] border border-line p-2.5"><Skeleton className="aspect-square w-full !rounded-[14px]" /><Skeleton className="mt-3 h-4 w-4/5" /><Skeleton className="mt-2 h-3 w-1/2" /><Skeleton className="mt-3 h-5 w-2/3" /></div>)}</div>
        : productsError && !products ? <div className="card"><Empty icon={PackageSearch} title="Couldn't load plans" text={productsError} action={<button onClick={onRetry} className="btn btn-secondary btn-sm">Try again</button>} /></div>
        : filtered.length ? <div className="grid min-w-0 grid-cols-2 gap-3">{filtered.map((p) => <div key={p.id} className="min-w-0"><PlanCard product={p} onClick={() => onBuy(p)} /></div>)}</div>
        : <div className="card"><Empty icon={Search} title="No subscriptions found" text="Try another search or category." /></div>}
    </div>
  );
}
