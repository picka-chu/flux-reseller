import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { moneyParts } from "../lib/format";
import { Skeleton, StatusPill } from "./ui";
import type { Product } from "../lib/types";

/** Large Coinbase-style balance read-out. */
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

/** Product listing row (asset-row pattern). */
export function ProductRow({ product, onClick }: { product: Product; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-fill/60 active:bg-fill">
      <span data-accent={product.accent} className="tile grid h-11 w-11 shrink-0 place-items-center rounded-full text-[19px] font-bold">{product.icon}</span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px] font-semibold">{product.name}</b>
        <span className="block truncate text-[13px] text-muted">{product.category}</span>
      </span>
      <span className="text-right">
        <b className="num block text-[15px] font-semibold">${product.price.toFixed(2)}</b>
        {product.tag && <span className="text-[12px] font-medium text-brand">{product.tag}</span>}
      </span>
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
