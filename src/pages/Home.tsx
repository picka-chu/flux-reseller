import { ArrowUpRight, PackageSearch, ShieldCheck } from "lucide-react";
import { AdSlot, PlanCard, WalletStrip } from "../components/Blocks";
import { Empty, Notice, SectionHeader, Skeleton } from "../components/ui";
import { inTelegram } from "../lib/telegram";
import { BRAND } from "../lib/brand";
import type { Me, Product } from "../lib/types";

interface Props {
  me: Me | null; meLoading: boolean;
  products: Product[] | null; productsLoading: boolean; productsError: string | null;
  onBuy: (p: Product) => void; onTopup: () => void; onShop: () => void; onHelp: () => void; onRetry: () => void;
}

export function Home({ me, meLoading, products, productsLoading, productsError, onBuy, onTopup, onShop, onHelp, onRetry }: Props) {
  return (
    <div className="animate-rise">
      <section className="pb-7 pt-5">
        <p className="text-[14px] text-muted">{me?.first_name ? "Welcome back" : `Welcome to ${BRAND}`}</p>
        <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight">{me?.first_name ?? "Subscriptions, simplified"}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">Browse premium plans and pay from one wallet.</p>
        <div className="mt-6"><WalletStrip balance={me?.balance} loading={meLoading} onAdd={onTopup} /></div>
        {!meLoading && !me && !inTelegram && <Notice>Open the app inside Telegram to see your wallet and subscribe.</Notice>}
      </section>

      <AdSlot placement="home" />

      <SectionHeader title="All subscriptions" action={<button onClick={onShop} className="text-[14px] font-semibold text-brand">See all</button>} />
      {productsLoading && !products ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-72 !rounded-[20px]" />)}</div>
      ) : productsError && !products ? (
        <div className="card"><Empty icon={PackageSearch} title="Couldn't load plans" text={productsError} action={<button onClick={onRetry} className="btn btn-secondary btn-sm">Try again</button>} /></div>
      ) : products?.length ? (
        <div className="grid gap-3 sm:grid-cols-2">{products.map((p) => <PlanCard key={p.id} product={p} onClick={() => onBuy(p)} />)}</div>
      ) : (
        <div className="card"><Empty icon={PackageSearch} title="No plans yet" text="New subscriptions will appear here." /></div>
      )}

      <button onClick={onHelp} className="card mt-6 flex w-full items-center gap-3.5 p-4 text-left transition active:bg-fill">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand"><ShieldCheck size={20} /></span>
        <span className="flex-1"><b className="block text-[15px]">Need a hand?</b><span className="text-[13px] text-muted">Help with orders and payments</span></span>
        <ArrowUpRight size={18} className="text-muted" />
      </button>
    </div>
  );
}
