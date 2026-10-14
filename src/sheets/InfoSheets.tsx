import { Check, ShieldCheck, MessageCircle } from "lucide-react";
import { Button } from "../components/ui";

const COPY = {
  help: { icon: MessageCircle, title: "How can we help?", body: "For help with a deposit or an order, message the official store bot and include your request ID. Never share passwords, login codes or wallet recovery phrases." },
  safety: { icon: ShieldCheck, title: "How payments work", body: "Deposits are reviewed manually. Creating a request or entering a transfer reference does not credit your wallet; an administrator must verify the funds arrived. Listings are samples until supplier fulfilment is configured." }
} as const;

export function InfoSheet({ kind, onClose }: { kind: keyof typeof COPY; onClose: () => void }) {
  const { icon: Icon, title, body } = COPY[kind];
  return (
    <div className="flex flex-col items-center pb-2 pt-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand"><Icon size={26} /></span>
      <h2 className="mt-4 text-[22px] font-bold tracking-tight">{title}</h2>
      <p className="my-3 text-[15px] leading-relaxed text-muted">{body}</p>
      <Button full size="lg" onClick={onClose}>Got it</Button>
    </div>
  );
}

export function SuccessSheet({ title, body, cta, onDone }: { title: string; body: string; cta: string; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center pb-2 pt-6 text-center">
      <span className="animate-pop grid h-16 w-16 place-items-center rounded-full bg-up text-white"><Check size={32} strokeWidth={3} /></span>
      <h2 className="mt-5 text-[24px] font-bold tracking-tight">{title}</h2>
      <p className="my-3 max-w-xs text-[15px] leading-relaxed text-muted">{body}</p>
      <Button full size="lg" onClick={onDone}>{cta}</Button>
    </div>
  );
}
