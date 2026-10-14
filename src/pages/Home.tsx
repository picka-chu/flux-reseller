import { ArrowUpRight, PackageSearch, ShieldCheck } from "lucide-react";
import { AdSlot, PlanCard, WalletStrip } from "../components/Blocks";
import { Empty, Notice, Skeleton } from "../components/ui";
import { inTelegram } from "../lib/telegram";
import type { FeedSection, Me, Product } from "../lib/types";

interface Props {
  me: Me | null; meLoading: boolean;
  feed: FeedSection[] | null; feedLoading: boolean; feedError: string | null;
  onBuy: (p: Product) => void; onTopup: () => void; onShop: () => void; onHelp: () => void; onRetry: () => void;
}

export function Home({ me, meLoading, feed, feedLoading, feedError, onBuy, onTopup, onShop, onHelp, onRetry }: Props) {
  return (
    <div className="animate-rise">
      <section className="pb-5 pt-5">
        <p className="text-[14px] text-muted">{me?.first_name ? "Welcome back" : "Welcome"}</p>
        <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight">{me?.first_name ?? "Subscriptions, simplified"}</h1>
        <div className="mt-5"><WalletStrip balance={me?.balance} loading={meLoading} onAdd={onTopup} /></div>
        {!meLoading && !me && !inTelegram && <Notice>Open the app inside Telegram to see your wallet and subscribe.</Notice>}
      </section>

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
      ) : feedError && !feed ? (
        <div className="card"><Empty icon={PackageSearch} title="Couldn't load the feed" text={feedError} action={<button onClick={onRetry} className="btn btn-secondary btn-sm">Try again</button>} /></div>
      ) : feed?.some((section) => section.items.length > 0) ? (
        feed.filter((section) => section.items.length > 0).map((section) => (
          <section key={section.key} className="mb-8">
            <div className="mb-3">
              <h2 className="text-[19px] font-bold tracking-tight">{section.title}</h2>
              <p className="text-[13px] text-muted">{section.subtitle}</p>
            </div>
            <div className="scroll-x -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
              {section.items.map((p) => (
                <div key={p.id} className="w-[156px] shrink-0 snap-start">
                  <PlanCard product={p} onClick={() => onBuy(p)} />
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="card"><Empty icon={PackageSearch} title="Nothing new right now" text="Restocks, new arrivals and offers appear here." /></div>
      )}

      <button onClick={onShop} className="btn btn-secondary btn-md mb-6 w-full">Browse all plans <ArrowUpRight size={18} /></button>

      <button onClick={onHelp} className="card mb-6 flex w-full items-center gap-3.5 p-4 text-left transition active:bg-fill">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand"><ShieldCheck size={20} /></span>
        <span className="flex-1"><b className="block text-[15px]">Need a hand?</b><span className="text-[13px] text-muted">Chat with our support team</span></span>
        <ArrowUpRight size={18} className="text-muted" />
      </button>
    </div>
  );
}
