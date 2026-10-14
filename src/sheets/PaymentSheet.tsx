import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, Notice, useToast } from "../components/ui";
import { post } from "../lib/api";
import { dateTime } from "../lib/format";
import { haptic } from "../lib/telegram";
import type { TopupCreated } from "./TopUpSheet";

const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

function CopyRow({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); haptic.success(); window.setTimeout(() => setCopied(false), 1800); }
    catch { toast(value); }
  };
  return (
    <div className="card mb-3 flex items-center justify-between gap-3 p-4">
      <div className="min-w-0"><p className="text-[12px] text-muted">{label}</p><b className="block break-all text-[15px]">{value}</b></div>
      <Button variant="secondary" size="sm" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</Button>
    </div>
  );
}

export function PaymentSheet({ data, onSubmitted }: { data: TopupCreated; onSubmitted: () => void }) {
  const toast = useToast();
  const [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const left = new Date(data.expires_at).getTime() - now;
  const expired = left <= 0;

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);

  const submit = async () => {
    if (tx.trim().length < 3) return toast("Enter the transfer reference first", "error");
    setBusy(true);
    try { await post(`/api/topups/${data.id}/verify`, { tx_reference: tx.trim() }); onSubmitted(); }
    catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <p className="text-center text-[15px] font-semibold">Complete deposit</p>
      <div className="py-6 text-center">
        <p className="text-[13px] text-muted">Send exactly</p>
        <p className="num mt-1 text-[44px] font-bold leading-none">{Number(data.expected_amount).toFixed(3)}</p>
        <p className="mt-1 text-[15px] font-semibold text-muted">{data.currency} · {data.method_label}</p>
        <span className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold ${expired ? "bg-down/10 text-down" : "bg-fill"}`}>
          {expired ? "Expired" : `Expires in ${clock(left)}`}
        </span>
        <p className="mt-2 text-[12px] text-muted">{dateTime(data.expires_at)}</p>
      </div>
      <CopyRow label="Send to" value={data.recipient} />
      <CopyRow label="Your payment reference" value={data.reference} />
      <Notice>Send the exact amount, decimals included. Those decimals are how we match your payment to your request.</Notice>
      <label className="mb-2 block text-[13px] font-semibold text-muted" htmlFor="tx">Transaction ID / transfer reference</label>
      <input id="tx" className="input mb-4" value={tx} onChange={(e) => setTx(e.target.value)} maxLength={160} placeholder="Paste the transfer reference" />
      <Button full size="lg" loading={busy} disabled={expired} onClick={submit}>I’ve sent the payment</Button>
    </>
  );
}
