import { useState } from "react";
import { ArrowLeftRight, Check, Send, type LucideIcon } from "lucide-react";
import { Button, Notice, useToast } from "../components/ui";
import { post } from "../lib/api";
import { haptic } from "../lib/telegram";

export interface TopupCreated {
  id: string; reference: string; expected_amount: number; expires_at: string;
  recipient: string; method_label: string; currency: string;
}
const PRESETS = [10, 25, 50, 100, 250];
const METHODS: { id: string; title: string; sub: string; icon: LucideIcon }[] = [
  { id: "bybit", title: "Bybit UID transfer", sub: "USDT · internal transfer", icon: ArrowLeftRight },
  { id: "telegram_wallet", title: "Telegram Wallet", sub: "USDT · send to the store wallet", icon: Send }
];

export function TopUpSheet({ onCreated }: { onCreated: (t: TopupCreated) => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("25");
  const [method, setMethod] = useState("bybit");
  const [busy, setBusy] = useState(false);
  const n = Number(amount);
  const valid = Number.isInteger(n) && n >= 1 && n <= 10000;

  const submit = async () => {
    if (!valid) return toast("Enter a whole-dollar amount from $1 to $10,000", "error");
    setBusy(true);
    try { onCreated(await post<TopupCreated>("/api/topups", { amount: n, method })); }
    catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <p className="text-center text-[15px] font-semibold">Add funds</p>
      <div className="flex items-baseline justify-center pb-2 pt-6">
        <span className="text-[40px] font-semibold text-muted">$</span>
        <input
          inputMode="numeric"
          aria-label="Amount in US dollars"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 5))}
          style={{ width: `${Math.max(amount.length, 1)}ch` }}
          className="num min-w-[1ch] bg-transparent text-center text-[64px] font-bold leading-none outline-none"
          placeholder="0"
        />
      </div>
      <p className={`mb-5 text-center text-[13px] ${amount && !valid ? "text-down" : "text-muted"}`}>{amount && !valid ? "Enter $1 – $10,000" : "USD · whole dollars"}</p>
      <div className="scroll-x -mx-4 sm:-mx-5 mb-6 flex justify-center gap-2 overflow-x-auto px-4 sm:px-5">
        {PRESETS.map((p) => (
          <button key={p} onClick={() => { haptic.select(); setAmount(String(p)); }} className={`shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold transition ${n === p ? "bg-ink text-bg" : "bg-fill"}`}>${p}</button>
        ))}
      </div>

      <p className="mb-2 text-[13px] font-semibold text-muted">Pay with</p>
      <div className="card divide-y divide-line overflow-hidden">
        {METHODS.map(({ id, title, sub, icon: Icon }) => (
          <button key={id} onClick={() => { haptic.select(); setMethod(id); }} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-fill"><Icon size={18} /></span>
            <span className="flex-1"><b className="block text-[15px]">{title}</b><span className="text-[13px] text-muted">{sub}</span></span>
            <span className={`grid h-6 w-6 place-items-center rounded-full border-2 ${method === id ? "border-brand bg-brand text-white" : "border-line"}`}>{method === id && <Check size={14} strokeWidth={3} />}</span>
          </button>
        ))}
      </div>
      <Notice>You’ll get the exact amount and address on the next screen. Send that exact figure so we can match your payment.</Notice>
      <Button full size="lg" loading={busy} disabled={!valid} onClick={submit}>Continue</Button>
    </>
  );
}
