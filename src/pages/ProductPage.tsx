import { useRef, useState } from "react";
import { ArrowLeft, Check, PackageCheck } from "lucide-react";
import { Button, Notice, Skeleton, useToast } from "../components/ui";
import { ProductArt } from "../components/Blocks";
import { ApiError, post } from "../lib/api";
import { money, periodSuffix } from "../lib/format";
import { inTelegram } from "../lib/telegram";
import type { Me, Product } from "../lib/types";

interface Props {
  product: Product;
  me: Me | null;
  meLoading: boolean;
  onBack: () => void;
  onTopup: () => void;
  onPurchased: (orderId: string) => void;
}

export function ProductPage({ product, me, meLoading, onBack, onTopup, onPurchased }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Keep the key when a request fails so retrying an uncertain response is safe.
  const purchaseKey = useRef<string | null>(null);
  const short = me !== null && me.balance < product.price;
  const per = periodSuffix(product.period);
  const oneTime = product.period === "one-time";

  const buy = async () => {
    setBusy(true);
    try {
      purchaseKey.current ??= (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID().replace(/-/g, "")
        : `${Date.now()}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      const order = await post<{ id: string }>("/api/orders", {
        product_id: product.id,
        idempotency_key: purchaseKey.current,
      });
      purchaseKey.current = null;
      onPurchased(order.id);
    } catch (error) {
      // An expired/invalid Telegram session is different from a server or network failure;
      // show the correct instruction instead of a misleading "Open in Telegram" message.
      if (error instanceof ApiError && (error.status === 401 || error.status === 503)) {
        toast(error.message || "Open the app inside Telegram to continue.", "error");
      } else {
        toast(error instanceof Error ? error.message : "Request failed", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-rise min-w-0">
      {!inTelegram && (
        <header className="sticky top-0 z-10 -mx-4 mb-4 flex h-12 items-center bg-bg/95 px-4 backdrop-blur-xl sm:-mx-5 sm:px-5">
          <button onClick={onBack} className="flex h-10 items-center gap-2 rounded-full pr-3 text-[14px] font-semibold" aria-label="Back to shop">
            <ArrowLeft size={20} /> Back
          </button>
        </header>
      )}

      <section className="pb-6">
        <div className="relative mx-auto w-full max-w-[280px]">
          <ProductArt product={product} large className="aspect-square w-full rounded-[28px]" />
          {!product.in_stock && <span className="absolute inset-0 grid place-items-center rounded-[28px] bg-bg/75 text-sm font-semibold">Currently unavailable</span>}
        </div>
        <div className="pt-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{product.category}</p>
          <h1 className="mt-1 break-words text-[28px] font-bold leading-tight tracking-tight">{product.name}</h1>
          {product.tag && <span className="mt-3 inline-flex rounded-full bg-brand-soft px-3 py-1 text-[12px] font-semibold text-brand">{product.tag}</span>}
          <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="num text-[36px] font-bold leading-none tracking-tight">{money(product.price)}</span>
            <span className="text-[14px] text-muted">{per || (oneTime ? "one-time" : "")}</span>
          </div>
          <p className="mt-2 text-[13px] text-muted">{oneTime ? "One-time purchase" : "Paid from your wallet"}</p>
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[17px] font-semibold">About this plan</h2>
        <p className="break-words text-[14px] leading-relaxed text-muted">{product.description || "Subscription details will be provided when available."}</p>
      </section>

      {product.features?.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-3 text-[17px] font-semibold">What’s included</h2>
          <ul className="card space-y-3 p-4">
            {product.features.map((feature) => (
              <li key={feature} className="flex min-w-0 items-start gap-2.5 text-[14px]">
                <Check size={17} strokeWidth={2.4} className="mt-0.5 shrink-0 text-brand" />
                <span className="break-words">{feature}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mb-4 divide-y divide-line overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-[14px]">
          <span className="text-muted">Price</span><b className="num text-right">{money(product.price)}{per}</b>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-[14px]">
          <span className="text-muted">Wallet balance</span>
          {meLoading ? <Skeleton className="h-4 w-20" /> : <b className={short ? "num text-down" : "num"}>{me ? money(me.balance) : "—"}</b>}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-[14px]">
          <span className="text-muted">Availability</span>
          <span className={product.in_stock ? "font-semibold text-up" : "font-semibold text-down"}>{product.in_stock ? "Available" : "Sold out"}</span>
        </div>
      </section>

      <Notice>Orders are recorded for review and aren’t fulfilled automatically yet. Please allow time for manual processing.</Notice>
      <div className="sticky bottom-0 -mx-4 mt-5 border-t border-line bg-bg/95 px-4 pb-3 pt-3 backdrop-blur-xl sm:-mx-5 sm:px-5">
        {short
          ? <Button full size="lg" onClick={onTopup}>Add funds to continue</Button>
          : <Button full size="lg" loading={busy} disabled={!me || meLoading || !product.in_stock} onClick={buy}>
              {!product.in_stock ? "Sold out" : meLoading ? "Checking wallet…" : me ? `${oneTime ? "Buy" : "Subscribe"} · ${money(product.price)}${per}` : "Sign in via Telegram to buy"}
            </Button>}
        <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted"><PackageCheck size={13} /> No charge until you confirm</p>
      </div>
    </div>
  );
}
