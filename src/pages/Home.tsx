import { ArrowUpRight, PackageSearch, ShieldCheck, Sparkles, TrendingUp, Zap, Compass, Gift, ChevronRight } from "lucide-react";
import { AdSlot, CategoryMark, PlanCard, ProductArt, WalletStrip } from "../components/Blocks";
import { Empty, Notice, Skeleton } from "../components/ui";
import { inTelegram } from "../lib/telegram";
import type { FeedSection, Me, Product } from "../lib/types";

interface Props {
  me: Me | null; meLoading: boolean; products: Product[] | null;
  feed: FeedSection[] | null; feedLoading: boolean; feedError: string | null;
  onBuy: (p: Product) => void; onTopup: () => void; onShop: () => void; onHelp: () => void; onRetry: () => void;
}

export function Home({ me, meLoading, products, feed, feedLoading, feedError, onBuy, onTopup, onShop, onHelp, onRetry }: Props) {
  const allProducts = products ?? feed?.flatMap((section) => section.items) ?? [];
  const categories = Array.from(new Set(allProducts.map((product) => product.category).filter(Boolean))).slice(0, 12);
  const featured = (feed ?? []).flatMap((section) => section.items).find((product) => product.in_stock) ?? allProducts.find((product) => product.in_stock);

  return (
    <div className="animate-rise">
      <section className="pb-5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-brand">FLUX MARKETPLACE</p>
            <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight">{me?.first_name ? `Good to see you, ${me.first_name}` : "Your digital toolkit"}</h1>
            <p className="mt-1.5 max-w-[280px] text-[14px] leading-relaxed text-muted">Discover the subscriptions and AI tools you’ll actually use.</p>
          </div>
          <button onClick={onShop} aria-label="Explore shop" className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fill text-ink"><Compass size={21} /></button>
        </div>
        <div className="mt-4"><WalletStrip balance={me?.balance} loading={meLoading} onAdd={onTopup} /></div>
        {!meLoading && !me && !inTelegram && <div className="mt-3"><Notice>Open the app inside Telegram to see your wallet and subscribe.</Notice></div>}
      </section>

      <button onClick={onShop} className="group relative mb-6 block min-h-[188px] w-full overflow-hidden rounded-[26px] bg-[#19152f] p-5 text-left text-white shadow-[0_14px_35px_-18px_rgba(79,70,229,0.7)]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_90%_15%,rgba(139,92,246,0.75),transparent_38%),radial-gradient(ellipse_at_5%_100%,rgba(79,70,229,0.55),transparent_45%)]" />
        <div className="absolute -right-3 top-5 grid h-28 w-28 rotate-12 place-items-center rounded-[28px] border border-white/15 bg-white/10 backdrop-blur-sm"><Sparkles size={62} strokeWidth={1.2} className="text-violet-200" /></div>
        <div className="absolute right-[82px] top-[88px] grid h-11 w-11 -rotate-12 place-items-center rounded-2xl bg-white text-violet-700 shadow-lg"><Zap size={22} fill="currentColor" /></div>
        <div className="relative z-10 max-w-[68%]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"><Sparkles size={12} /> Explore FLUX</span>
          <h2 className="mt-3 text-[23px] font-bold leading-[1.08] tracking-tight">Big tools.<br />One simple shop.</h2>
          <p className="mt-2 text-[12px] leading-relaxed text-white/75">AI, creativity, streaming and more.</p>
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-2 text-[12px] font-bold text-[#241b55]">Explore subscriptions <ArrowUpRight size={15} /></span>
        </div>
        <span className="absolute bottom-3 right-4 text-[10px] font-semibold tracking-[0.18em] text-white/45">YOUR DIGITAL WORLD</span>
      </button>

      <section className="mb-7">
        <div className="mb-3 flex items-end justify-between">
          <div><h2 className="text-[19px] font-bold tracking-tight">Browse categories</h2><p className="mt-0.5 text-[12px] text-muted">Find the right tool faster</p></div>
          <button onClick={onShop} className="flex items-center gap-0.5 pb-1 text-[12px] font-semibold text-brand">All <ChevronRight size={15} /></button>
        </div>
        {categories.length ? (
          <div className="scroll-x -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
            {categories.map((category) => <button key={category} onClick={onShop} className="flex w-[82px] shrink-0 flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-2 py-3 transition active:scale-95"><span className="grid h-12 w-12 place-items-center rounded-[17px] bg-fill text-brand"><CategoryMark name={category} size={24} /></span><span className="line-clamp-2 min-h-[2.2em] w-full text-center text-[11px] font-semibold leading-tight">{category}</span></button>)}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">{["AI Tools", "Design", "Streaming", "Music"].map((category) => <button key={category} onClick={onShop} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-fill text-brand"><CategoryMark name={category} size={22} /></span><span className="text-center text-[11px] font-semibold">{category}</span></button>)}</div>
        )}
      </section>

      <AdSlot placement="home" />

      {featured && <button onClick={() => onBuy(featured)} className="mb-7 flex w-full items-center gap-3 rounded-[22px] border border-line bg-surface p-3 text-left transition active:scale-[0.99]"><ProductArt product={featured} className="h-[88px] w-[88px] shrink-0 rounded-[17px]" /><span className="min-w-0 flex-1 py-1"><span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-brand"><TrendingUp size={12} /> Pick for you</span><span className="mt-1 block line-clamp-2 text-[15px] font-bold leading-snug">{featured.name}</span><span className="mt-1 block truncate text-[12px] text-muted">{featured.category} · Ready to explore</span></span><ChevronRight size={19} className="shrink-0 text-muted" /></button>}

      {feedLoading ? (
        <div className="space-y-8">{[0, 1].map((i) => <div key={i}><Skeleton className="mb-3 h-6 w-40" /><div className="flex gap-3 overflow-hidden">{[0, 1, 2].map((j) => <Skeleton key={j} className="aspect-[3/4] w-[156px] shrink-0 !rounded-[18px]" />)}</div></div>)}</div>
      ) : feedError && !feed ? (
        <div className="card"><Empty icon={PackageSearch} title="Couldn't load the feed" text={feedError} action={<button onClick={onRetry} className="btn btn-secondary btn-sm">Try again</button>} /></div>
      ) : feed?.some((section) => section.items.length > 0) ? (
        feed.filter((section) => section.items.length > 0).map((section, index) => <section key={section.key} className="mb-8"><div className="mb-3 flex items-end justify-between"><div><h2 className="text-[19px] font-bold tracking-tight">{section.title}</h2><p className="text-[13px] text-muted">{section.subtitle}</p></div><span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted">{index === 0 ? <Sparkles size={13} /> : <Gift size={13} />}{index === 0 ? "For you" : "Discover"}</span></div><div className="scroll-x -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">{section.items.map((p) => <div key={p.id} className="w-[min(164px,44vw)] shrink-0 snap-start"><PlanCard product={p} onClick={() => onBuy(p)} /></div>)}</div></section>)
      ) : (
        <section className="mb-7 rounded-[24px] border border-line bg-surface p-5"><div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand"><Sparkles size={25} /></div><h2 className="text-[18px] font-bold">Your next favorite tool is waiting</h2><p className="mt-1 text-[13px] leading-relaxed text-muted">We’re refreshing the feed. Browse the shop to see every available subscription.</p><button onClick={onShop} className="btn btn-secondary btn-md mt-4 w-full">Browse subscriptions <ArrowUpRight size={17} /></button></section>
      )}

      <button onClick={onShop} className="btn btn-secondary btn-md mb-4 w-full">Browse all plans <ArrowUpRight size={18} /></button>
      <button onClick={onHelp} className="card mb-6 flex w-full items-center gap-3.5 p-4 text-left transition active:bg-fill"><span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand"><ShieldCheck size={20} /></span><span className="flex-1"><b className="block text-[15px]">Need a hand?</b><span className="text-[13px] text-muted">Chat with our support team</span></span><ArrowUpRight size={18} className="text-muted" /></button>
    </div>
  );
}
