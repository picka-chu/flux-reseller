import { useState } from "react";
import { ArrowLeft, Check, Package, Repeat, Wallet } from "lucide-react";
import { ProductArt } from "../components/Blocks";
import { Button, useToast } from "../components/ui";
import { post } from "../lib/api";
import { money, periodSuffix } from "../lib/format";
import type { Me, Product } from "../lib/types";

interface Props {
  product: Product;
  me: Me | null;
  onBack: () => void;
  onPurchased: (orderId: string) => void;
  onTopup: () => void;
  onSupport: () => void;
}

/** Full product page. Hierarchy, top to bottom: category, name, price, status, then the supporting detail. */
export function ProductPage({ product, me, onBack, onPurchased, onTopup, onSupport }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const per = periodSuffix(product.period);
  const oneTime = product.period === "one-time";
  const billing = oneTime ? "One-time payment" : product.period === "year" ? "Billed once a year" : "Billed once a month";
  const short = me !== null && me.balance < product.price;

  const buy = async () => {
    setBusy(true);
    try {
      const o = await post<{ id: string }>("/api/orders", { product_id: product.id });
      onPurchased(o.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Request failed", "error");
    } finally {
      setBusy(false);
    }
  };

  let cta: { label: string; onClick?: () => void; disabled?: boolean } = {
    label: `${oneTime ? "Buy" : "Subscribe"} · ${money(product.price)}${per}`, onClick: buy,
  };
  if (!product.in_stock) cta = { label: "Sold out", disabled: true };
  else if (!me) cta = { label: "Open in Telegram to buy", disabled: true };
  else if (short) cta = { label: "Add funds to continue", onClick: onTopup };

  return (
    <div className="animate-rise pb-36">
      <div className="sticky top-0 z-20 -mx-5 flex h-14 items-center gap-3 bg-bg/85 px-5 backdrop-blur-xl">
        <button onClick={onBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full bg-fill transition active:scale-95">
          <ArrowLeft size={20} />
        </button>
      </div>

      <ProductArt product={product} large className="mt-2 aspect-[4/3] w-full rounded-[28px]" />

      <header className="mt-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{product.category}</p>
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-tight">{product.name}</h1>
        <div className="mt-4 flex items-end gap-1.5">
          <span className="num text-[36px] font-bold leading-none">{money(product.price)}</span>
          {per && <span className="pb-0.5 text-[15px] text-muted">{per}</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">{billing}</span>
          <span className="text-line">•</span>
          {product.in_stock
            ? <span className="pill" data-tone="up">In stock</span>
            : <span className="pill" data-tone="down">Sold out</span>}
        </div>
      </header>

      <Section title="About">
        {product.description
          ? <p className="text-[15px] leading-[1.65] text-ink/80">{product.description}</p>
          : <p className="text-[15px] text-muted">Details for this plan are being added.</p>}
      </Section>

      {product.features?.length > 0 && (
        <Section title="What's included">
          <ul className="card divide-y divide-line overflow-hidden">
            {product.features.map((f) => (
              <li key={f} className="flex items-start gap-3 px-4 py-3.5 text-[15px]">
                <Check size={18} strokeWidth={2.4} className="mt-0.5 shrink-0 text-up" />{f}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="How it works">
        <ol className="space-y-4">
          <Step n={1} title="Pay from your wallet" text="The price is taken from your balance when you confirm." />
          <Step n={2} title="We place the order" text="The order is sent to our supplier. We confirm it in the background." />
          <Step n={3} title="Access appears in Orders" text="Your details show on the order once it is delivered." />
        </ol>
      </Section>

      <Section title="Details">
        <dl className="card divide-y divide-line overflow-hidden">
          <Row icon={Repeat} label="Billing" value={billing} />
          <Row icon={Package} label="Delivery" value="Digital" />
          <Row icon={Wallet} label="Your balance" value={me ? money(me.balance) : "Open in Telegram"} warn={short} />
        </dl>
      </Section>

      <p className="mt-10 text-center text-[13px] text-muted">
        Questions about this plan?{" "}
        <button onClick={onSupport} className="font-semibold text-brand">Chat with support</button>
      </p>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-5 py-3">
          <div className="shrink-0 whitespace-nowrap">
            <p className="text-[12px] text-muted">Total</p>
            <p className="num text-[18px] font-bold">{money(product.price)}{per && <span className="text-[13px] font-medium text-muted">{per}</span>}</p>
          </div>
          <Button size="lg" loading={busy} disabled={cta.disabled} onClick={cta.onClick} className="min-w-0 flex-1 truncate">{cta.label}</Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="mb-3 text-[18px] font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <li className="flex gap-4">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fill text-[13px] font-bold">{n}</span>
      <span>
        <b className="block text-[15px] font-semibold">{title}</b>
        <span className="block text-[14px] leading-relaxed text-muted">{text}</span>
      </span>
    </li>
  );
}

function Row({ icon: Icon, label, value, warn }: { icon: typeof Repeat; label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      <Icon size={18} className="shrink-0 text-muted" />
      <dt className="text-[14px] text-muted">{label}</dt>
      <dd className={`ml-auto text-right text-[14px] font-semibold ${warn ? "text-down" : ""}`}>{value}</dd>
    </div>
  );
}
