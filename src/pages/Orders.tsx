import { useState } from "react";
import { Package, PackageOpen, RefreshCw } from "lucide-react";
import { ActivityRow } from "../components/Blocks";
import { Button, Empty, ListSkeleton, Segmented, SectionHeader } from "../components/ui";
import { money, shortDate } from "../lib/format";
import type { Order } from "../lib/types";

type Filter = "all" | "active" | "done";
const ACTIVE = ["pending_review", "processing", "needs_review"];

export function Orders({ orders, loading, error, onRefresh, onExplore }: { orders: Order[] | null; loading: boolean; error: string | null; onRefresh: () => void; onExplore: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const list = (orders ?? []).filter((o) => filter === "all" || (filter === "active" ? ACTIVE.includes(o.status) : !ACTIVE.includes(o.status)));
  const active = (orders ?? []).filter((o) => ACTIVE.includes(o.status)).length;

  return (
    <div className="animate-rise">
      <section className="pb-5 pt-3">
        <h1 className="text-[32px] font-bold tracking-tight">Orders</h1>
        <p className="mt-1 text-[15px] text-muted">{orders ? `${orders.length} total · ${active} in progress` : "Your purchases and their status"}</p>
      </section>
      <div className="mb-4">
        <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "active", label: "In progress" }, { value: "done", label: "Completed" }]} />
      </div>
      <SectionHeader title="History" action={<button onClick={onRefresh} className="flex items-center gap-1.5 text-[13px] font-semibold text-brand"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh</button>} />
      <div className="card overflow-hidden">
        {loading && !orders ? <ListSkeleton rows={4} />
          : list.length ? <div className="divide-y divide-line">
              {list.map((o) => (
                <div key={o.id}>
                  <ActivityRow icon={Package} title={o.product_name || "Subscription"} subtitle={`${o.id} · ${shortDate(o.created_at)}`} amount={money(o.price)} status={o.status} />
                  {o.delivery_note && (
                    <div className="px-4 pb-4">
                      <p className="mb-1.5 text-[12px] font-semibold text-muted">{o.status === "refunded" ? "Refund note" : "Delivery details"}</p>
                      <div className="select-all break-all rounded-xl bg-fill p-3 font-mono text-[12px] leading-relaxed">{o.delivery_note}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          : <Empty icon={PackageOpen} title={error ? "Couldn't load orders" : "No orders here"} text={error ?? "When you buy something it will appear here."} action={!error && filter === "all" ? <Button size="sm" onClick={onExplore}>Explore plans</Button> : undefined} />}
      </div>
    </div>
  );
}
