import { BadgeCheck, FileText, MessageCircle, Package, ShieldCheck, Wallet } from "lucide-react";
import { Avatar } from "../components/Chrome";
import { MenuRow } from "../components/Blocks";
import { Segmented, Skeleton } from "../components/ui";
import { money } from "../lib/format";
import { inTelegram, tg } from "../lib/telegram";
import type { ThemeMode } from "../hooks/useTheme";
import type { Me } from "../lib/types";

interface Props { me: Me | null; meLoading?: boolean; mode: ThemeMode; onMode: (m: ThemeMode) => void; go: (t: "wallet" | "orders") => void; onHelp: () => void; onSafety: () => void; onLegal: () => void }

export function Profile({ me, meLoading = false, mode, onMode, go, onHelp, onSafety, onLegal }: Props) {
  const name = me?.first_name || tg?.initDataUnsafe?.user?.first_name || "Welcome";
  const handle = me?.username || tg?.initDataUnsafe?.user?.username;
  return (
    <div className="animate-rise">
      <section className="flex flex-col items-center pb-6 pt-5 text-center">
        {meLoading ? <Skeleton className="h-20 w-20 !rounded-full" /> : <Avatar name={name} size={80} />}
        {meLoading ? <><Skeleton className="mt-3 h-6 w-36" /><Skeleton className="mt-2 h-4 w-24" /></> : <><h1 className="mt-3 text-[24px] font-bold tracking-tight">{name}</h1><p className="text-[14px] text-muted">{handle ? `@${handle}` : "Telegram account"}</p></>}
        {inTelegram && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-up/10 px-2.5 py-1 text-[12px] font-semibold text-up"><BadgeCheck size={14} /> Verified via Telegram</span>}
        <div className="mt-5 grid w-full grid-cols-2 gap-3 text-left">
          <div className="card min-w-0 p-4"><p className="text-[12px] text-muted">Balance</p>{meLoading ? <Skeleton className="mt-2 h-6 w-20" /> : <b className="num text-[20px]">{me ? money(me.balance) : "—"}</b>}</div>
          <div className="card min-w-0 p-4"><p className="text-[12px] text-muted">Orders</p>{meLoading ? <Skeleton className="mt-2 h-6 w-12" /> : <b className="num text-[20px]">{me ? me.orders_count : "—"}</b>}</div>
        </div>
      </section>

      <p className="mb-2 text-[13px] font-semibold text-muted">Appearance</p>
      <div className="mb-6"><Segmented value={mode} onChange={onMode} options={[{ value: "auto", label: "Telegram" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /></div>

      <p className="mb-2 text-[13px] font-semibold text-muted">Account</p>
      <div className="card mb-6 divide-y divide-line overflow-hidden">
        <MenuRow icon={Wallet} label="Wallet" hint="Balance and deposits" onClick={() => go("wallet")} />
        <MenuRow icon={Package} label="Orders" hint="Purchases and delivery status" onClick={() => go("orders")} />
      </div>
      <p className="mb-2 text-[13px] font-semibold text-muted">Support</p>
      <div className="card divide-y divide-line overflow-hidden">
        <MenuRow icon={MessageCircle} label="Help & support" hint="Questions about orders or payments" onClick={onHelp} />
        <MenuRow icon={ShieldCheck} label="Safety & payments" hint="How deposits are reviewed" onClick={onSafety} />
        <MenuRow icon={FileText} label="Terms and policies" hint="Terms, refunds, privacy and supplier information" onClick={onLegal} />
      </div>
      <p className="py-8 text-center text-[12px] text-muted">Subscriptions, simplified</p>
    </div>
  );
}
