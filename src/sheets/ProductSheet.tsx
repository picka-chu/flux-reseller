import { useState } from "react";
import { Check } from "lucide-react";
import { Button, Notice, useToast } from "../components/ui";
import { ProductArt } from "../components/Blocks";
import { post } from "../lib/api";
import { money, periodSuffix } from "../lib/format";
import type { Me, Product } from "../lib/types";

export function ProductSheet({ product, me, onPurchased, onTopup }: { product: Product; me: Me | null; onPurchased: (orderId: string) => void; onTopup: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const short = me !== null && me.balance < product.price;
  const per = periodSuffix(product.period);
  const oneTime = product.period === "one-time";

  const buy = async () => {
    setBusy(true);
    try { const o = await post<{ id: string }>("/api/orders", { product_id: product.id }); onPurchased(o.id); }
    catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex flex-col items-center pb-5 pt-4 text-center">
        <ProductArt product={product} large className="h-44 w-44 rounded-[32px]" />
        <h2 className="mt-4 text-[24px] font-bold tracking-tight">{product.name}</h2>
        <p className="text-[14px] text-muted">{product.category}</p>
        <p className="num mt-4 text-[40px] font-bold leading-none">
          {money(product.price)}<span className="text-[16px] font-medium text-muted">{per}</span>
        </p>
        <p className="mt-2 text-[13px] text-muted">{oneTime ? "One-time purchase" : "Paid from your wallet"}</p>
      </div>
      <p className="mb-4 text-center text-[14px] leading-relaxed text-muted">{product.description}</p>

      {product.features?.length > 0 && (
        <ul className="card mb-4 space-y-3 p-4">
          {product.features.map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-[14px]"><Check size={16} strokeWidth={2.4} className="shrink-0 text-brand" />{f}</li>
          ))}
        </ul>
      )}

      <div className="card divide-y divide-line">
        <div className="flex justify-between px-4 py-3.5 text-[15px]"><span className="text-muted">Price</span><b className="num">{money(product.price)}{per}</b></div>
        <div className="flex justify-between px-4 py-3.5 text-[15px]"><span className="text-muted">Your balance</span><b className={`num ${short ? "text-down" : ""}`}>{me ? money(me.balance) : "—"}</b></div>
      </div>
      <Notice>Supplier delivery isn’t configured yet. Orders are recorded for manual review and aren’t fulfilled automatically.</Notice>
      {short
        ? <Button full size="lg" onClick={onTopup}>Add funds to continue</Button>
        : <Button full size="lg" loading={busy} disabled={!me || !product.in_stock} onClick={buy}>{!product.in_stock ? "Sold out" : me ? `${oneTime ? "Buy" : "Subscribe"} · ${money(product.price)}${per}` : "Open in Telegram to continue"}</Button>}
    </>
  );
}
