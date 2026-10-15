import { ArrowUpRight, ChevronRight, Plus, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { money, moneyParts, periodSuffix } from "../lib/format";
import { request } from "../lib/api";
import { useResource } from "../hooks/useResource";
import { Skeleton, StatusPill } from "./ui";
import type { Ad, Product } from "../lib/types";

/** Large balance read-out, used on the wallet page. */
export function BalanceHero({ label = "Total balance", balance, loading, hint }: { label?: string; balance?: number; loading?: boolean; hint?: string }) {
  const parts = balance === undefined ? null : moneyParts(balance);
  return (
    <div>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      {loading && !parts ? (
        <Skeleton className="mt-2 h-12 w-48" />
      ) : (
        <p className="num mt-0.5 flex items-baseline text-[48px] font-bold leading-[1.1] tracking-tight">
          {parts ? (<><span className="mr-0.5 text-[28px] font-semibold text-muted">$</span>{parts.whole}<span className="text-[28px] text-muted">.{parts.cents}</span></>) : "—"}
        </p>
      )}
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

/** Wallet summary, kept calm and compact rather than a large balance read-out. */
export function WalletStrip({ balance, loading, onAdd }: { balance?: number; loading?: boolean; onAdd: () => void }) {
  return (
    <div className="card flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-[13px] text-muted">Wallet balance</p>
        {loading && balance === undefined ? <Skeleton className="mt-1.5 h-6 w-24" /> : (
          <b className="num mt-0.5 block text-[22px] font-semibold">{balance === undefined ? "—" : money(balance)}</b>
        )}
      </div>
      <button onClick={onAdd} className="btn btn-secondary btn-sm shrink-0"><Plus size={16} /> Add funds</button>
    </div>
  );
}

/** Product artwork: the plan's image when one exists, otherwise a sticker on a soft colour wash. */
export function ProductArt({ product, className = "", large = false }: { product: Pick<Product, "accent" | "image_url" | "sticker" | "name">; className?: string; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      data-accent={product.accent}
      className={`grid place-items-center overflow-hidden ${className}`}
      style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--a, var(--brand)) 24%, var(--surface)) 0%, color-mix(in srgb, var(--a, var(--brand)) 7%, var(--surface)) 100%)" }}
    >
      {product.image_url && !broken
        ? <img src={product.image_url} alt={product.name} loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        : <span aria-hidden="true" className={`select-none leading-none drop-shadow-[0_6px_10px_rgba(0,0,0,0.18)] ${large ? "text-[96px]" : "text-[56px]"}`} style={{ transform: "rotate(-6deg)" }}>{product.sticker}</span>}
    </div>
  );
}

/** Shopping-style product tile for the grid. */
export function PlanCard({ product, onClick }: { product: Product; onClick: () => void }) {
  const per = periodSuffix(product.period);
  const [whole, cents] = product.price.toFixed(2).split(".");
  const soldOut = !product.in_stock;
  return (
    <button onClick={onClick} className={`flex w-full min-w-0 flex-col overflow-hidden rounded-[18px] border border-line bg-surface text-left transition active:scale-[0.98] ${soldOut ? "opacity-80" : ""}`}>
      <div className="relative">
        <ProductArt product={product} className="aspect-square w-full" />
        {soldOut
          ? <span className="absolute left-2.5 top-2.5 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-bg">Sold out</span>
          : product.tag && <span className="absolute left-2.5 top-2.5 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-semibold shadow-sm">{product.tag}</span>}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 min-h-[2.6em] break-words text-[14px] font-semibold leading-snug">{product.name}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted">{product.category}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="min-w-0 whitespace-nowrap">
            <b className="num text-[16px] font-bold">${whole}.{cents}</b>
            <span className="text-[11px] text-muted">{per}</span>
          </p>
          <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${soldOut ? "bg-fill text-muted" : "bg-brand text-on-brand"}`}>
            <Plus size={17} strokeWidth={2.4} />
          </span>
        </div>
      </div>
    </button>
  );
}

/** Premium sponsored placement. Only rendered when the admin has published an active ad. */
export function AdCard({ ad }: { ad: Ad }) {
  const body = (
    <>
      {ad.image_url && <img src={ad.image_url} alt="" loading="lazy" className="aspect-[16/7] w-full object-cover" />}
      <div className="p-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Sponsored</span>
        <h3 className="mt-2 text-[18px] font-semibold tracking-tight">{ad.title}</h3>
        {ad.body && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{ad.body}</p>}
        {ad.cta && (
          <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand">
            {ad.cta}<ArrowUpRight size={16} />
          </span>
        )}
      </div>
    </>
  );
  const shell = "card block overflow-hidden text-left transition hover:border-ink/15";
  const style = { background: "linear-gradient(160deg, var(--brand-soft), var(--surface) 62%)" };
  return ad.link_url
    ? <a href={ad.link_url} target="_blank" rel="noopener noreferrer sponsored" className={shell} style={style}>{body}</a>
    : <div className={shell} style={style}>{body}</div>;
}

/** Fetches and renders active ads for a page. Renders nothing when there are none. */
export function AdSlot({ placement }: { placement: "home" | "shop" }) {
  const ads = useResource(() => request<Ad[]>(`/api/ads?placement=${placement}`));
  if (!ads.data?.length) return null;
  return <div className="mb-6 space-y-3 animate-rise">{ads.data.map((ad) => <AdCard key={ad.id} ad={ad} />)}</div>;
}

/** Round quick-action button with label underneath. */
export function QuickAction({ icon: Icon, label, onClick, primary }: { icon: LucideIcon; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className="group flex flex-1 flex-col items-center gap-2">
      <span className={`grid h-14 w-14 place-items-center rounded-full transition group-active:scale-95 ${primary ? "bg-brand text-white dark:text-[#0a0b0d]" : "bg-fill text-ink"}`}>
        <Icon size={24} strokeWidth={2} />
      </span>
      <span className="text-[13px] font-semibold">{label}</span>
    </button>
  );
}

/** Generic activity row for top-ups and orders. */
export function ActivityRow({ icon: Icon, title, subtitle, amount, status, positive }: { icon: LucideIcon; title: string; subtitle: string; amount?: string; status: string; positive?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fill"><Icon size={20} strokeWidth={1.9} /></span>
      <div className="min-w-0 flex-1">
        <b className="block truncate text-[15px] font-semibold capitalize">{title}</b>
        <span className="block truncate text-[13px] text-muted">{subtitle}</span>
        <span className="mt-1.5 block"><StatusPill status={status} /></span>
      </div>
      {amount && <b className={`num self-start pt-0.5 text-[15px] font-semibold ${positive ? "text-up" : ""}`}>{amount}</b>}
    </div>
  );
}

/** Settings / navigation row. */
export function MenuRow({ icon: Icon, label, hint, onClick, trailing }: { icon: LucideIcon; label: string; hint?: string; onClick?: () => void; trailing?: ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-fill/60 active:bg-fill">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fill"><Icon size={19} strokeWidth={1.9} /></span>
      <span className="min-w-0 flex-1">
        <b className="block text-[15px] font-semibold">{label}</b>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
      {trailing ?? <ChevronRight size={18} className="text-muted" />}
    </button>
  );
}
