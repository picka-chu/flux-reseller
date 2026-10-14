import { useMemo, useState } from "react";
import { CircleHelp, Package, Plus, Search, ShieldCheck, ArrowUpRight, PackageSearch } from "lucide-react";
import { BalanceHero, ProductRow, QuickAction } from "../components/Blocks";
import { Empty, ListSkeleton, Notice, SectionHeader } from "../components/ui";
import { inTelegram } from "../lib/telegram";
import type { Me, Product } from "../lib/types";

interface Props {
  me: Me | null; meLoading: boolean;
  products: Product[] | null; productsLoading: boolean; productsError: string | null;
  onBuy: (p: Product) => void; onTopup: () => void; onOrders: () => void; onHelp: () => void; onRetry: () => void;
}

export function Home({ me, meLoading, products, productsLoading, productsError, onBuy, onTopup, onOrders, onHelp, onRetry }: Props) {
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
      <section className="pb-6 pt-3">
        <BalanceHero balance={me?.balance} loading={meLoading} hint={me ? "Available in your FLUX wallet" : undefined} />
        <div className="mt-7 flex gap-2">
          <QuickAction icon={Plus} label="Add funds" onClick={onTopup} primary />
          <QuickAction icon={Package} label="Orders" onClick={onOrders} />
          <QuickAction icon={CircleHelp} label="Support" onClick={onHelp} />
        </div>
        {!meLoading && !me && !inTelegram && <Notice>Open FLUX inside Telegram to see your wallet and place orders.</Notice>}
      </section>

      <SectionHeader title="Marketplace" />
      <label className="mb-3 flex h-12 items-center gap-2.5 rounded-full bg-fill px-4 text-muted focus-within:ring-2 focus-within:ring-brand">
        <Search size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted" />
      </label>
      <div className="scroll-x -mx-5 mb-3 flex gap-2 overflow-x-auto px-5">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition ${category === c ? "bg-ink text-bg" : "bg-fill text-ink"}`}>{c}</button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {productsLoading && !products ? <ListSkeleton rows={5} />
          : productsError && !products ? <Empty icon={PackageSearch} title="Couldn't load products" text={productsError} action={<button onClick={onRetry} className="btn btn-secondary btn-sm">Try again</button>} />
          : filtered.length ? <div className="divide-y divide-line">{filtered.map((p) => <ProductRow key={p.id} product={p} onClick={() => onBuy(p)} />)}</div>
          : <Empty icon={Search} title="No products found" text="Try another search or category." />}
      </div>

      <button onClick={onHelp} className="card mt-5 flex w-full items-center gap-3.5 p-4 text-left transition active:bg-fill">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand"><ShieldCheck size={20} /></span>
        <span className="flex-1"><b className="block text-[15px]">Need a hand?</b><span className="text-[13px] text-muted">Help with orders and payments</span></span>
        <ArrowUpRight size={18} className="text-muted" />
      </button>
    </div>
  );
}
