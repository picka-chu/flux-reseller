import { ArrowDownLeft, Plus, RefreshCw, Wallet as WalletIcon } from "lucide-react";
import { ActivityRow, BalanceHero } from "../components/Blocks";
import { Button, Empty, ListSkeleton, Notice, SectionHeader } from "../components/ui";
import { dateTime, money, titleCase } from "../lib/format";
import type { Me, Topup } from "../lib/types";

interface Props { me: Me | null; meLoading: boolean; topups: Topup[] | null; loading: boolean; error: string | null; onTopup: () => void; onRefresh: () => void }

export function Wallet({ me, meLoading, topups, loading, error, onTopup, onRefresh }: Props) {
  return (
    <div className="animate-rise">
      <section className="pb-6 pt-3">
        <BalanceHero label="USD balance" balance={me?.balance} loading={meLoading} hint="Credits are added after payment review" />
        <Button full size="lg" className="mt-6" onClick={onTopup}><Plus size={20} /> Add funds</Button>
      </section>

      <SectionHeader title="Activity" action={<button onClick={onRefresh} className="flex items-center gap-1.5 text-[13px] font-semibold text-brand"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh</button>} />
      <div className="card overflow-hidden">
        {loading && !topups ? <ListSkeleton rows={3} />
          : topups?.length ? <div className="divide-y divide-line">
              {topups.map((t) => (
                <ActivityRow key={t.id} icon={ArrowDownLeft} title={`${titleCase(t.method)} deposit`} subtitle={`${dateTime(t.created_at)} · ${t.reference}`} amount={`+${money(t.amount)}`} positive={t.status === "approved"} status={t.status} />
              ))}
            </div>
          : <Empty icon={WalletIcon} title={error ? "Couldn't load activity" : "No deposits yet"} text={error ?? "Add funds to start buying. Your deposits will show up here."} />}
      </div>
      <Notice>A transaction reference alone is not proof of payment. An administrator confirms receipt before your balance is credited.</Notice>
    </div>
  );
}
