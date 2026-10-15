import { ArrowUpRight, PackageSearch, Search, ShieldCheck, Sparkles } from "lucide-react";
import { AdSlot, CategoryMark, PlanCard, WalletStrip } from "../components/Blocks";
import { Empty, Notice, Skeleton } from "../components/ui";
import { inTelegram } from "../lib/telegram";
import type { FeedSection, Me, Product } from "../lib/types";

interface Props {
  me: Me | null; meLoading: boolean;
  products: Product[] | null; productsLoading: boolean;
  feed: FeedSection[] | null; feedLoading: boolean; feedError: string | null;
  onBuy: (p: Product) => void; onTopup: () => void; onShop: (category?: string) => void; onHelp: () => void; onRetry: () => void;
}

export function Home({ me, meLoading, products, productsLoading, feed, feedLoading, feedError, onBuy, onTopup, onShop, onHelp, onRetry }: Props) {
  const categories = Array.from(new Set((products ?? []).map((p) => p.category))).slice(0, 8);
  const hasFeed = Boolean(feed?.some((section) => section.items.length > 0));
  const fallbackProducts = (products ?? []).filter((p) => p.in_stock).slice(0, 6);

  return (
    <div className="animate-rise">
      <section className="pb-5 pt-3">
        <p className="text-[14px] text-muted">{me?.first_name ? `Welcome back, ${me.first_name}` : "Welcome to FLUX"}</p>
        <div className="relative mt-2 overflow-hidden rounded-[26px] bg-brand-soft p-5 sm:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-brand/10 blur-2xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 right-16 h-28 w-28 rounded-full bg-brand/15 blur-2xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
              <Sparkles size={13} /> Digital subscriptions
            </span>
            <h1 className="mt-3 max-w-[300px] text-[28px] font-bold leading-[1.08] tracking-tight sm:text-[32px]">
              Your digital world, all in one place.
            </h1>
            <p className="mt-2 max-w-[290px] text-[14px] leading-relaxed text-muted">
              Discover plans, manage your wallet, and track every order without the guesswork.
            </p>
            <button onClick={() => onShop("All")} className="btn btn-primary btn-md mt-5">
              Explore subscriptions <ArrowUpRight size={17} />
            </button>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute bottom-4 right-3 hidden opacity-20 sm:block">
            <Sparkles size={92} strokeWidth={1} />
          </div>
        </div>
        <div className="mt-4"><WalletStrip balance={me?.balance} loading={meLoading} onAdd={onTopup} /></div>
        {!meLoading && !me && !inTelegram && <div className="mt-3"><Notice>Open the app inside Telegram to access your wallet and subscribe.</Notice></div>}
      </section>

      {categories.length > 0 && (
        <section className="mb-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[19px] font-bold tracking-tight">Explore categories</h2>
              <p className="text-[13px] text-muted">Jump straight to what you need</p>
            </div>
            <button onClick={() => onShop("All")} className="shrink-0 text-[13px] font-semibold text-brand">See all</button>
          </div>
          <div className="scroll-x -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
            {categories.map((category) => (
              <button key={category} onClick={() => onShop(category)} className="flex min-w-[106px] shrink-0 flex-col items-start gap-3 rounded-[18px] border border-line bg-surface p-3.5 text-left transition active:scale-[0.98]">
                <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-brand-soft text-brand"><CategoryMark name={category} size={21} /></span>
                <span className="max-w-[130px] truncate text-[13px] font-semibold">{category}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <AdSlot placement="home" />

      {feedLoading && !feed ? (
        <div className="space-y-8">
          {[0, 1].map((i) => (
            <div key={i}>
              <Skeleton className="mb-3 h-6 w-40" />
              <div className="flex gap-3 overflow-hidden">
                {[0, 1, 2].map((j) => <Skeleton key={j} className="aspect-[3/4] w-[156px] shrink-0 !rounded-[18px]" />)}
              </div>
            </div>
          ))}
        </div>
      ) : hasFeed ? (
        feed!.filter((section) => section.items.length > 0).map((section) => (
          <section key={section.key} className="mb-8">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[19px] font-bold tracking-tight">{section.title}</h2>
                <p className="text-[13px] text-muted">{section.subtitle}</p>
              </div>
              <button onClick={() => onShop("All")} className="shrink-0 text-[13px] font-semibold text-brand">View all</button>
            </div>
            <div className="scroll-x -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
              {section.items.map((p) => (
                <div key={p.id} className="w-[min(156px,43vw)] shrink-0 snap-start">
                  <PlanCard product={p} onClick={() => onBuy(p)} />
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <section className="mb-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[19px] font-bold tracking-tight">Discover subscriptions</h2>
              <p className="text-[13px] text-muted">Browse what's available right now</p>
            </div>
            <button onClick={() => onShop("All")} className="shrink-0 text-[13px] font-semibold text-brand">See all</button>
          </div>
          {fallbackProducts.length > 0 ? (
            <div className="scroll-x -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
              {fallbackProducts.map((p) => (
                <div key={p.id} className="w-[min(156px,43vw)] shrink-0 snap-start">
                  <PlanCard product={p} onClick={() => onBuy(p)} />
                </div>
              ))}
            </div>
          ) : productsLoading ? (
            <div className="flex gap-3 overflow-hidden">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[3/4] w-[156px] shrink-0 !rounded-[18px]" />)}
            </div>
          ) : (
            <div className="card"><Empty icon={PackageSearch} title="Catalog is being refreshed" text="Please check back shortly, or contact our support team if you need help." action={<button onClick={onRetry} className="btn btn-secondary btn-sm">Refresh catalog</button>} /></div>
          )}
          {feedError && <p className="mt-2 text-[12px] text-muted">Live collections couldn't load, so we're showing available plans instead.</p>}
        </section>
      )}

      <button onClick={() => onShop("All")} className="btn btn-secondary btn-md mb-5 w-full">Browse all subscriptions <ArrowUpRight size={18} /></button>

      <button onClick={onHelp} className="card mb-6 flex w-full items-center gap-3.5 p-4 text-left transition active:bg-fill">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand"><ShieldCheck size={20} /></span>
        <span className="flex-1"><b className="block text-[15px]">Need a hand?</b><span className="text-[13px] text-muted">Chat with our support team</span></span>
        <ArrowUpRight size={18} className="text-muted" />
      </button>
    </div>
  );
}
