import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  AlertTriangle, Boxes, Check, ChevronRight, Coins, LayoutDashboard, Megaphone, Moon, MoreHorizontal, Package, Receipt, RefreshCw,
  Search, Settings, ShieldCheck, Sun, TrendingUp, UserPlus, Users, Wallet, X, type LucideIcon
} from "lucide-react";
import { BrandMark } from "../components/Chrome";
import { BRAND } from "../lib/brand";
import { Button, Empty, Segmented, Sheet, StatusPill, ToastProvider, useToast } from "../components/ui";
import { useTheme } from "../hooks/useTheme";
import { post, request } from "../lib/api";
import { confirmAction } from "../lib/telegram";
import { dateTime, money, titleCase } from "../lib/format";
import type { AdminAd, AdminCatalog, AdminCatalogItem, AdminDashboard, AdminOrder, AdminOverview, AdminSettings, AdminTopup, AdminUser, CatalogDefaults } from "../lib/types";

type Page = "overview" | "topups" | "orders" | "customers" | "ads" | "catalog" | "settings";
const NAV: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "topups", label: "Top-ups", icon: Wallet },
  { id: "orders", label: "Orders", icon: Package },
  { id: "customers", label: "Customers", icon: Users },
  { id: "ads", label: "Ads", icon: Megaphone },
  { id: "catalog", label: "Catalog", icon: Boxes },
  { id: "settings", label: "Settings", icon: Settings }
];
const TITLES: Record<Page, [string, string]> = {
  overview: ["Overview", "A live snapshot of your store."],
  topups: ["Top-ups", "Review requests only after checking payment receipt."],
  orders: ["Orders", "Update fulfilment status and handle eligible refunds."],
  customers: ["Customers", "Search registered customer accounts."],
  ads: ["Ads", "Publish sponsored placements for the home and shop pages."],
  catalog: ["Catalog", "Supplier plans, your margins, and what customers see."],
  settings: ["Settings", "Pricing defaults and payment addresses."]
};

export default function Admin() {
  return <ToastProvider><Console /></ToastProvider>;
}

function Console() {
  const toast = useToast();
  const theme = useTheme();
  const [page, setPage] = useState<Page>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [topups, setTopups] = useState<AdminTopup[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [ads, setAds] = useState<AdminAd[]>([]);
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null);
  const [settingsData, setSettingsData] = useState<AdminSettings | null>(null);
  const [search, setSearch] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acting, setActing] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setOverview(await request<AdminOverview>("/api/admin/overview"));
      if (page === "overview") setDashboard(await request<AdminDashboard>("/api/admin/dashboard"));
      if (page === "topups") setTopups(await request<AdminTopup[]>("/api/admin/topups"));
      if (page === "orders") setOrders(await request<AdminOrder[]>("/api/admin/orders"));
      if (page === "customers") setUsers(await request<AdminUser[]>("/api/admin/users"));
      if (page === "ads") setAds(await request<AdminAd[]>("/api/admin/ads"));
      if (page === "catalog") setCatalog(await request<AdminCatalog>("/api/admin/catalog"));
      if (page === "catalog" || page === "settings") setSettingsData(await request<AdminSettings>("/api/admin/settings"));
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, message: string, run: () => Promise<unknown>, done: string) => {
    if (!(await confirmAction(message))) return;
    setActing(id);
    try { await run(); toast(done); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
    finally { setActing(""); }
  };
  const syncOrders = async () => {
    try { const r = await post<{ updated: number }>("/api/admin/orders/sync", {}); toast(`Supplier check done. ${r.updated} order(s) updated`); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
  };
  const decide = (t: AdminTopup, decision: "approve" | "reject") =>
    act(t.id, `${decision === "approve" ? "Approve" : "Reject"} top-up ${t.id}?${decision === "approve" ? " Only approve after confirming the funds arrived." : ""}`,
      () => post(`/api/admin/topups/${encodeURIComponent(t.id)}`, { decision }), `Top-up ${decision}d`);
  const setStatus = (o: AdminOrder, status: string) =>
    act(o.id, `${status === "refunded" ? "Refund" : `Mark as ${status}`} order ${o.id}?`,
      () => post(`/api/admin/orders/${encodeURIComponent(o.id)}`, { status }), "Order updated");

  const q = search.toLowerCase();
  const match = (...v: unknown[]) => v.join(" ").toLowerCase().includes(q);
  const fTopups = useMemo(() => topups.filter((t) => match(t.id, t.telegram_id, t.method, t.status, t.tx_reference, t.reference)), [topups, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const fOrders = useMemo(() => orders.filter((o) => match(o.id, o.telegram_id, o.username, o.first_name, o.product_id, o.status)), [orders, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const fUsers = useMemo(() => users.filter((u) => match(u.telegram_id, u.username, u.first_name)), [users, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = page === "topups" ? topups.length : page === "orders" ? orders.length : users.length;
  const [title, subtitle] = TITLES[page];
  const navigate = (p: Page) => { setPage(p); setSearch(""); setMoreOpen(false); };
  const MORE_PAGES: Page[] = ["ads", "catalog", "settings"];

  return (
    <div className="mx-auto min-h-dvh max-w-7xl px-4 pb-12 sm:px-7">
      <header className="sticky top-0 z-20 -mx-4 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur-xl sm:-mx-7 sm:h-16 sm:px-7">
        <a href="/" className="flex items-center gap-2.5"><BrandMark size={32} /><span className="text-[16px] font-semibold tracking-tight">{BRAND}</span><span className="hidden rounded-full bg-fill px-2.5 py-0.5 text-[12px] font-semibold text-muted sm:inline-flex">Operations</span></a>
        <div className="flex items-center gap-2">
          {page === "orders" && <Button variant="secondary" size="sm" aria-label="Check supplier" onClick={syncOrders}><RefreshCw size={16} /><span className="hidden sm:inline">Check supplier</span></Button>}
          <Button variant="secondary" size="sm" aria-label="Toggle theme" onClick={() => theme.setMode(theme.resolved === "dark" ? "light" : "dark")}>{theme.resolved === "dark" ? <Sun size={16} /> : <Moon size={16} />}</Button>
          <Button variant="secondary" size="sm" aria-label="Refresh" onClick={load}><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></Button>
        </div>
      </header>

      <div className="grid gap-5 pt-4 md:grid-cols-[210px_minmax(0,1fr)] md:gap-7 md:pt-6">
        <aside className="hidden md:block">
          <nav className="flex flex-col gap-1">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => navigate(id)} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-semibold transition ${page === id ? "bg-brand-soft text-brand" : "text-muted hover:bg-fill hover:text-ink"}`}>
                <Icon size={18} strokeWidth={1.9} /><span className="flex-1 text-left">{label}</span>
                {id === "topups" && !!overview?.pending_topups && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white dark:text-[#0a0b0d]">{overview.pending_topups}</span>}
              </button>
            ))}
          </nav>
          <div className="card mt-6 hidden p-4 text-[13px] leading-relaxed md:block">
            <ShieldCheck size={20} className="mb-2 text-brand" /><b className="block">Handle payments carefully</b>
            <p className="mt-1 text-muted">A submitted reference is not proof of payment. Verify the receiving account before approving.</p>
          </div>
        </aside>

        <main className="min-w-0 animate-rise pb-28 md:pb-0" key={page}>
          {error && (
            <div className="mb-5 flex gap-3 rounded-2xl bg-down/10 p-4 text-[14px] text-down">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div><b>Couldn’t load admin data</b><p className="mt-1 opacity-90">{error}. Make sure this Telegram account is listed in ADMIN_TELEGRAM_IDS.</p></div>
            </div>
          )}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div><h1 className="text-[26px] font-bold tracking-tight sm:text-[32px]">{title}</h1><p className="mt-1 text-[14px] text-muted sm:text-[15px]">{subtitle}</p></div>
            {!["overview", "ads", "catalog", "settings"].includes(page) && <span className="text-[13px] text-muted">{count} records · latest 100</span>}
          </div>

          {page === "overview" && <DashboardPanel d={dashboard} o={overview} go={setPage} />}
          {page === "ads" && <AdsPanel ads={ads} reload={load} />}
          {page === "catalog" && <CatalogPanel catalog={catalog} settings={settingsData} reload={load} />}
          {page === "settings" && <SettingsPanel settings={settingsData} reload={load} />}
          {!["overview", "ads", "catalog", "settings"].includes(page) && (
            <>
              <label className="mb-4 flex h-12 items-center gap-2.5 rounded-full bg-fill px-4 text-muted focus-within:ring-2 focus-within:ring-brand">
                <Search size={18} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${page}`} className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted" />
              </label>
              <div className="card overflow-hidden">
                {page === "topups" && <Table cols="md:grid-cols-[1.1fr_1fr_1.1fr_.8fr_auto]" head={["Request", "Customer", "Payment", "Status", "Actions"]} empty={<Empty icon={Wallet} title="No matching top-ups" text="New funding requests appear here." />}>
                  {fTopups.map((t) => (
                    <Row key={t.id} cols="md:grid-cols-[1.1fr_1fr_1.1fr_.8fr_auto]">
                      <Cell title={t.id} sub={dateTime(t.created_at)} />
                      <Cell title={`ID ${t.telegram_id}`} sub={`@${t.username || "not set"}`} />
                      <Cell title={`${money(t.base_cents / 100)} · ${titleCase(t.method)}`} sub={`Ref: ${t.tx_reference || "Not submitted"}`} breakSub />
                      <div><StatusPill status={t.status} /></div>
                      <div className="flex gap-2">
                        {t.status === "pending" ? (<>
                          <Button size="sm" loading={acting === t.id} disabled={!!acting} onClick={() => decide(t, "approve")}><Check size={14} /> Approve</Button>
                          <Button size="sm" variant="secondary" disabled={!!acting} onClick={() => decide(t, "reject")}><X size={14} /> Reject</Button>
                        </>) : <span className="text-[13px] text-muted">Reviewed</span>}
                      </div>
                    </Row>
                  ))}
                </Table>}
                {page === "orders" && <Table cols="md:grid-cols-[1fr_1fr_1fr_.8fr_auto]" head={["Order", "Customer", "Item", "Status", "Actions"]} empty={<Empty icon={Package} title="No matching orders" text="Orders appear here." />}>
                  {fOrders.map((o) => (
                    <Row key={o.id} cols="md:grid-cols-[1fr_1fr_1fr_.8fr_auto]">
                      <Cell title={o.id} sub={dateTime(o.created_at)} />
                      <Cell title={`${o.first_name || "Customer"} · ${o.telegram_id}`} sub={`@${o.username || "not set"}`} />
                      <Cell title={o.product_name || o.product_id} sub={`${money(o.price)} · profit ${money(o.price - o.cost)}`} />
                      <div><StatusPill status={o.status} /></div>
                      <div className="flex flex-wrap gap-2">
                        {!["delivered", "refunded"].includes(o.status) && (<>
                          <Button size="sm" variant="secondary" disabled={!!acting} onClick={() => setStatus(o, "processing")}>Processing</Button>
                          <Button size="sm" disabled={!!acting} onClick={() => setStatus(o, "delivered")}>Delivered</Button>
                          <Button size="sm" variant="danger" disabled={!!acting} onClick={() => setStatus(o, "refunded")}>Refund</Button>
                        </>)}
                      </div>
                    </Row>
                  ))}
                </Table>}
                {page === "customers" && <Table cols="md:grid-cols-[1.4fr_1fr_.7fr_.7fr]" head={["Customer", "Telegram ID", "Balance", "Orders"]} empty={<Empty icon={Users} title="No matching customers" />}>
                  {fUsers.map((u) => (
                    <Row key={u.telegram_id} cols="md:grid-cols-[1.4fr_1fr_.7fr_.7fr]">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-fill text-[14px] font-bold">{(u.first_name || "U").charAt(0).toUpperCase()}</span>
                        <Cell title={u.first_name || "Customer"} sub={`@${u.username || "no username"}`} />
                      </div>
                      <span className="text-[13px] text-muted">{u.telegram_id}</span>
                      <b className="num text-[15px]">{money(u.balance)}</b>
                      <span className="text-[15px]">{u.orders_count}</span>
                    </Row>
                  ))}
                </Table>}
              </div>
            </>
          )}
        </main>
      </div>

      <nav aria-label="Admin" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-2xl">
          {([["overview", "Overview", LayoutDashboard], ["topups", "Top-ups", Wallet], ["orders", "Orders", Package], ["customers", "Customers", Users]] as [Page, string, LucideIcon][]).map(([id, label, Icon]) => {
            const active = page === id;
            const pending = id === "topups" ? (overview?.pending_topups ?? 0) : 0;
            return (
              <button key={id} onClick={() => navigate(id)} aria-current={active ? "page" : undefined}
                      className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-brand" : "text-muted"}`}>
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                  {pending > 0 && <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-[18px] text-white dark:text-[#0a0b0d]">{pending}</span>}
                </span>
                {label}
              </button>
            );
          })}
          <button onClick={() => setMoreOpen(true)} aria-current={MORE_PAGES.includes(page) ? "page" : undefined}
                  className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${MORE_PAGES.includes(page) ? "text-brand" : "text-muted"}`}>
            <MoreHorizontal size={22} strokeWidth={MORE_PAGES.includes(page) ? 2.2 : 1.8} />
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <Sheet onClose={() => setMoreOpen(false)}>
          <p className="mb-3 text-[16px] font-semibold">More</p>
          <div className="card divide-y divide-line overflow-hidden">
            {NAV.filter((n) => MORE_PAGES.includes(n.id)).map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => navigate(id)} className="flex min-h-[56px] w-full items-center gap-3.5 px-4 py-3 text-left active:bg-fill">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-fill"><Icon size={18} /></span>
                <b className="flex-1 text-[15px] font-semibold">{label}</b>
                <ChevronRight size={18} className="text-muted" />
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function DashboardPanel({ d, o, go }: { d: AdminDashboard | null; o: AdminOverview | null; go: (p: Page) => void }) {
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");
  const today = d?.series.at(-1);
  const yesterday = d?.series.at(-2);
  const totalRevenue14 = d ? d.series.reduce((n, x) => n + x.revenue, 0) : 0;
  const totalOrders14 = d ? d.series.reduce((n, x) => n + x.orders, 0) : 0;
  const values = d ? d.series.map((x) => (metric === "revenue" ? x.revenue : x.orders)) : [];
  const peak = Math.max(1, ...values);

  const vsYesterday = (now?: number, before?: number) => {
    if (now === undefined || before === undefined) return "";
    if (before === 0) return now === 0 ? "Same as yesterday" : "Up from zero yesterday";
    const pct = Math.round(((now - before) / before) * 100);
    return `${pct >= 0 ? "+" : ""}${pct}% vs yesterday`;
  };
  const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const kpis: { icon: LucideIcon; label: string; value: string; note: string }[] = [
    { icon: Coins, label: "Revenue", value: money(d?.totals.revenue), note: vsYesterday(today?.revenue, yesterday?.revenue) },
    { icon: Receipt, label: "Orders", value: String(d?.totals.orders ?? "—"), note: vsYesterday(today?.orders, yesterday?.orders) },
    { icon: UserPlus, label: "Customers", value: String(d?.totals.users ?? "—"), note: today ? `${today.customers} new today` : "" },
    { icon: TrendingUp, label: "Profit", value: money(d?.totals.profit), note: d ? `${d.totals.paying_customers} paying customers` : "" }
  ];
  const attention: [Page, LucideIcon, string, string, number | undefined][] = [
    ["topups", Wallet, "Review top-ups", "Confirm transfers arrived before approving", d?.totals.pending_topups ?? o?.pending_topups],
    ["orders", Package, "Review orders", "Update fulfilment or issue refunds", d?.totals.pending_orders ?? o?.pending_orders],
    ["ads", Megaphone, "Live ads", "Sponsored placements currently shown", d?.totals.live_ads]
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map(({ icon: Icon, label, value, note }) => (
          <div key={label} className="card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-fill"><Icon size={18} /></span>
              {note && <span className="text-right text-[12px] font-medium text-muted">{note}</span>}
            </div>
            <p className="text-[13px] text-muted">{label}</p>
            <b className="num mt-0.5 block text-[24px] font-bold leading-tight sm:text-[28px]">{value}</b>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold">Last 14 days</h2>
              <p className="text-[13px] text-muted">
                {d ? `${money(totalRevenue14)} revenue · ${totalOrders14} orders` : "Loading…"}
              </p>
            </div>
            <div className="w-56"><Segmented value={metric} onChange={setMetric} options={[{ value: "revenue", label: "Revenue" }, { value: "orders", label: "Orders" }]} /></div>
          </div>
          <div className="mt-6 flex h-40 items-end gap-1.5 sm:h-48">
            {d?.series.map((x, i) => {
              const v = values[i];
              const h = v > 0 ? Math.max(6, (v / peak) * 100) : 2;
              return (
                <div key={x.date} className="group flex h-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t-md transition ${v > 0 ? "bg-brand/80 group-hover:bg-brand" : "bg-fill"}`}
                    style={{ height: `${h}%` }}
                    title={`${dayLabel(x.date)}: ${metric === "revenue" ? money(x.revenue) : `${x.orders} orders`}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted">
            <span>{d ? dayLabel(d.series[0].date) : ""}</span><span>Today</span>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-[17px] font-bold">Needs attention</h2>
          <p className="mb-2 text-[13px] text-muted">Work waiting on you</p>
          {attention.map(([id, Icon, t, s, n]) => (
            <button key={id} onClick={() => go(id)} className="flex w-full items-center gap-3.5 border-t border-line py-3.5 text-left first:border-0">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Icon size={18} /></span>
              <span className="min-w-0 flex-1"><b className="block text-[15px]">{t}</b><span className="block truncate text-[13px] text-muted">{s}</span></span>
              <b className="num text-[17px]">{n ?? "—"}</b><ChevronRight size={18} className="text-muted" />
            </button>
          ))}
          <div className="mt-2 border-t border-line pt-4">
            <div className="flex justify-between text-[13px]"><span className="text-muted">Wallet liabilities</span><b className="num">{money(d?.totals.wallet_liabilities ?? o?.wallet_liabilities)}</b></div>
            <div className="mt-2 flex justify-between text-[13px]"><span className="text-muted">Approved top-ups, lifetime</span><b className="num">{money(d?.totals.approved_topups ?? o?.approved_topups)}</b></div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pb-2 pt-5">
            <div><h2 className="text-[17px] font-bold">Recent activity</h2><p className="text-[13px] text-muted">Latest orders and top-up requests</p></div>
          </div>
          {d?.recent.length ? (
            <div className="divide-y divide-line">
              {d.recent.map((r) => (
                <button key={`${r.kind}-${r.id}`} onClick={() => go(r.kind === "order" ? "orders" : "topups")} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 px-5 py-3.5 text-left transition hover:bg-fill/60">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-fill">{r.kind === "order" ? <Receipt size={17} /> : <Wallet size={17} />}</span>
                  <span className="min-w-0">
                    <b className="block truncate text-[14px] font-semibold">{r.title}</b>
                    <span className="block truncate text-[12px] text-muted">{r.subtitle} · {dateTime(r.at)}</span>
                  </span>
                  <span className="text-right">
                    <b className="num block text-[14px]">{money(r.amount)}</b>
                    <span className="mt-1 inline-block"><StatusPill status={r.status} /></span>
                  </span>
                </button>
              ))}
            </div>
          ) : <Empty icon={Receipt} title={d ? "No activity yet" : "Loading activity"} text={d ? "Orders and top-up requests appear here." : undefined} />}
        </section>

        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="text-[17px] font-bold">Top plans</h2>
            <p className="mb-4 text-[13px] text-muted">By number of orders, excluding refunds</p>
            {d?.top_products.length ? d.top_products.map((p) => (
              <div key={p.product_id} className="mb-4 last:mb-0">
                <div className="mb-1.5 flex justify-between text-[14px]"><b className="truncate font-semibold">{p.name}</b><span className="num text-muted">{p.orders} · {money(p.revenue)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-fill"><div className="h-full rounded-full bg-brand" style={{ width: `${(p.orders / Math.max(1, d.top_products[0].orders)) * 100}%` }} /></div>
              </div>
            )) : <p className="text-[14px] text-muted">No orders yet.</p>}
          </section>

          <section className="card p-5">
            <h2 className="text-[17px] font-bold">Order status</h2>
            <p className="mb-3 text-[13px] text-muted">All orders by current status</p>
            {d?.status_breakdown.length ? d.status_breakdown.map((s) => (
              <div key={s.status} className="flex items-center justify-between border-t border-line py-2.5 first:border-0">
                <StatusPill status={s.status} /><b className="num text-[15px]">{s.count}</b>
              </div>
            )) : <p className="text-[14px] text-muted">No orders yet.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Table({ cols, head, children, empty }: { cols: string; head: string[]; children: ReactNode[]; empty: ReactNode }) {
  return (
    <>
      <div className={`hidden gap-3 border-b border-line bg-fill/60 px-5 py-3 text-[12px] font-semibold text-muted md:grid ${cols}`}>{head.map((h) => <span key={h}>{h}</span>)}</div>
      {children.length ? <div className="divide-y divide-line">{children}</div> : empty}
    </>
  );
}
const Row = ({ cols, children }: { cols: string; children: ReactNode }) => <div className={`grid gap-3 px-4 py-4 md:items-center md:px-5 ${cols}`}>{children}</div>;
const Cell = ({ title, sub, capitalize, breakSub }: { title: string; sub: string; capitalize?: boolean; breakSub?: boolean }) => (
  <div className="min-w-0"><b className={`block truncate text-[14px] font-semibold ${capitalize ? "capitalize" : ""}`}>{title}</b><span className={`block text-[12px] text-muted ${breakSub ? "break-all" : "truncate"}`}>{sub}</span></div>
);

function AdsPanel({ ads, reload }: { ads: AdminAd[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const blank = { title: "", body: "", cta: "", link_url: "", image_url: "", placement: "home", ends_at: "" };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const field = (k: keyof typeof blank) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const create = async () => {
    setSaving(true);
    try {
      await post("/api/admin/ads", {
        title: form.title.trim(),
        body: form.body.trim() || null,
        cta: form.cta.trim() || null,
        link_url: form.link_url.trim() || null,
        image_url: form.image_url.trim() || null,
        placement: form.placement,
        ends_at: form.ends_at || null
      });
      toast("Ad published");
      setForm(blank);
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
    finally { setSaving(false); }
  };

  const toggle = async (a: AdminAd) => {
    try {
      await post(`/api/admin/ads/${encodeURIComponent(a.id)}`, { active: !a.active });
      toast(a.active ? "Ad paused" : "Ad is live");
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
  };

  const remove = async (a: AdminAd) => {
    if (!(await confirmAction(`Delete the ad “${a.title}”? This cannot be undone.`))) return;
    try {
      await request(`/api/admin/ads/${encodeURIComponent(a.id)}`, { method: "DELETE" });
      toast("Ad deleted");
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
  };

  const cols = "md:grid-cols-[1.6fr_.8fr_.9fr_auto]";
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="card overflow-hidden">
        <Table cols={cols} head={["Ad", "Placement", "Status", "Actions"]} empty={<Empty icon={Megaphone} title="No ads yet" text="Ads you publish appear on the chosen page with a Sponsored label." />}>
          {ads.map((a) => {
            const expired = !!a.ends_at && new Date(a.ends_at) <= new Date();
            const status = !a.active ? "paused" : expired ? "expired" : "active";
            return (
              <Row key={a.id} cols={cols}>
                <Cell title={a.title} sub={a.ends_at ? `Ends ${dateTime(a.ends_at)}` : "No end date"} />
                <span className="text-[14px] capitalize">{a.placement} page</span>
                <div><StatusPill status={status} /></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={expired && !a.active} onClick={() => toggle(a)}>{a.active ? "Pause" : "Activate"}</Button>
                  <Button size="sm" variant="danger" onClick={() => remove(a)}>Delete</Button>
                </div>
              </Row>
            );
          })}
        </Table>
      </div>

      <section className="card h-fit p-5">
        <h2 className="text-[17px] font-bold">New ad</h2>
        <p className="mb-5 mt-1 text-[13px] leading-relaxed text-muted">Shown with a “Sponsored” label. Links and images must use https://.</p>
        <div className="space-y-4">
          <AdField label="Headline">
            <input className="input" maxLength={80} value={form.title} onChange={field("title")} placeholder="Save 20% on yearly plans" />
          </AdField>
          <AdField label="Description">
            <textarea className="input min-h-[88px] py-3" style={{ height: "auto" }} maxLength={240} value={form.body} onChange={field("body")} placeholder="One line about the offer" />
          </AdField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AdField label="Button text">
              <input className="input" maxLength={24} value={form.cta} onChange={field("cta")} placeholder="Learn more" />
            </AdField>
            <AdField label="Show on">
              <select className="input" value={form.placement} onChange={field("placement")}>
                <option value="home">Home page</option>
                <option value="shop">Shop page</option>
              </select>
            </AdField>
          </div>
          <AdField label="Link (https://)">
            <input className="input" value={form.link_url} onChange={field("link_url")} placeholder="https://example.com/offer" />
          </AdField>
          <AdField label="Image (optional, https://)">
            <input className="input" value={form.image_url} onChange={field("image_url")} placeholder="https://example.com/banner.jpg" />
          </AdField>
          <AdField label="Ends on (optional)">
            <input type="date" className="input" value={form.ends_at} onChange={field("ends_at")} />
          </AdField>
          <Button full loading={saving} disabled={form.title.trim().length < 2} onClick={create}>Publish ad</Button>
        </div>
      </section>
    </div>
  );
}

const AdField = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
    {children}
  </label>
);

const Stat = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <div className="card p-5">
    <p className="text-[13px] text-muted">{label}</p>
    <b className="num mt-1 block truncate text-[22px] font-bold leading-tight">{value}</b>
    {note && <p className="mt-1 text-[12px] text-muted">{note}</p>}
  </div>
);

function CatalogPanel({ catalog, settings, reload }: { catalog: AdminCatalog | null; settings: AdminSettings | null; reload: () => Promise<void> }) {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const sup = settings?.supplier;
  const defaults: CatalogDefaults = catalog?.defaults ?? { margin_percent: 0, markup_cents: 0 };
  const cols = "md:grid-cols-[minmax(0,1.5fr)_.6fr_.6fr_.7fr_.6fr_.6fr_auto]";

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await post<{ synced: number; added: number; removed: number }>("/api/admin/supplier/sync", {});
      toast(`Synced ${r.synced} plans · ${r.added} new`);
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
    finally { setSyncing(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Supplier" value={sup?.store || (sup?.configured ? "Connected" : "Not connected")}
              note={sup?.ordering_enabled === false ? "Ordering is disabled" : sup?.ordering_enabled ? "Ordering is enabled" : undefined} />
        <Stat label="Supplier balance" value={sup?.balance != null ? money(sup.balance) : "—"} note="Top this up before customers order" />
        <Stat label="Plans listed" value={String(settings?.catalog_count ?? "—")} note="New supplier plans go live automatically" />
        <Stat label="Last sync" value={settings?.catalog_synced_at ? dateTime(settings.catalog_synced_at) : "Never"} note="Checked every 30 minutes" />
      </div>
      {sup?.error && <div className="rounded-2xl bg-warn/10 p-4 text-[14px] text-warn">{sup.error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold">Plans and pricing</h2>
          <p className="text-[13px] text-muted">You charge the supplier cost plus your margin. Blank margin uses the default in Settings.</p>
        </div>
        <Button variant="secondary" size="sm" loading={syncing} disabled={!sup?.configured} onClick={sync}><RefreshCw size={14} /> Sync from supplier</Button>
      </div>

      <div className="card overflow-hidden">
        <Table cols={cols} head={["Plan", "Supplier cost", "Margin", "Period", "You charge", "Profit", ""]}
               empty={<Empty icon={Boxes} title={catalog ? "No plans yet" : "Loading plans"} text="Plans appear here after the first supplier sync." />}>
          {(catalog?.items ?? []).map((item) => (
            <CatalogRow key={`${item.id}-${item.margin_percent}-${item.markup_cents}-${item.category}-${item.period}-${item.enabled}-${item.display_name}`}
                        item={item} defaults={defaults} cols={cols} reload={reload} />
          ))}
        </Table>
      </div>
    </div>
  );
}

function CatalogRow({ item, defaults, cols, reload }: { item: AdminCatalogItem; defaults: CatalogDefaults; cols: string; reload: () => Promise<void> }) {
  const toast = useToast();
  const initialMargin = item.margin_percent == null ? "" : String(item.margin_percent);
  const initialCategory = item.category;
  const initialPeriod = item.period;
  const [margin, setMargin] = useState(initialMargin);
  const [category, setCategory] = useState(initialCategory);
  const [period, setPeriod] = useState(initialPeriod);
  const [saving, setSaving] = useState(false);

  const m = margin.trim() === "" ? defaults.margin_percent : Number(margin);
  const sell = Math.ceil(item.cost_cents * (1 + m / 100) + defaults.markup_cents - 1e-9);
  const profit = sell - item.cost_cents;
  const dirty = margin !== initialMargin || category !== initialCategory || period !== initialPeriod;

  const save = async () => {
    const body: Record<string, unknown> = {};
    if (margin !== initialMargin) body.margin_percent = margin.trim() === "" ? null : Number(margin);
    if (category !== initialCategory && category.trim()) body.category = category.trim();
    if (period !== initialPeriod) body.period = period;
    setSaving(true);
    try { await post(`/api/admin/catalog/${item.id}`, body); toast("Plan saved"); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
    finally { setSaving(false); }
  };
  const toggle = async () => {
    try { await post(`/api/admin/catalog/${item.id}`, { enabled: !item.enabled }); toast(item.enabled ? "Plan hidden from customers" : "Plan is live"); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
  };

  const field = { height: 36, padding: "0 10px" } as const;
  return (
    <Row cols={cols}>
      <div className="min-w-0">
        <b className="block truncate text-[14px] font-semibold">{item.display_name || item.name}</b>
        <input className="input mt-1" style={{ ...field, fontSize: 12 }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" />
        <span className="mt-1 block text-[12px] text-muted">{item.in_stock ? `${item.stock} in stock` : "Out of stock"} · {item.sid}</span>
      </div>
      <span className="num text-[14px]">{money(item.supplier_price)}</span>
      <div className="flex items-center gap-1.5">
        <input className="input num" style={{ ...field, width: 74 }} inputMode="decimal" placeholder={String(defaults.margin_percent)} value={margin} onChange={(e) => setMargin(e.target.value)} aria-label="Margin percent" />
        <span className="text-[13px] text-muted">%</span>
      </div>
      <select className="input" style={{ ...field, fontSize: 13 }} value={period} onChange={(e) => setPeriod(e.target.value as AdminCatalogItem["period"])} aria-label="Billing period">
        <option value="month">Monthly</option>
        <option value="year">Yearly</option>
        <option value="one-time">One-time</option>
      </select>
      <b className="num text-[15px]">{money(sell / 100)}</b>
      <b className={`num text-[15px] ${profit > 0 ? "text-up" : ""}`}>{money(profit / 100)}</b>
      <div className="flex flex-wrap gap-2">
        {dirty && <Button size="sm" loading={saving} onClick={save}>Save</Button>}
        <Button size="sm" variant={item.enabled ? "secondary" : "primary"} onClick={toggle}>{item.enabled ? "Hide" : "Show"}</Button>
      </div>
    </Row>
  );
}

function SettingsPanel({ settings, reload }: { settings: AdminSettings | null; reload: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ margin: "", markup: "", bybit: "", telegram: "" });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings && !loaded) {
      setForm({
        margin: String(settings.default_margin_percent), markup: String(settings.default_markup_cents),
        bybit: settings.bybit_address, telegram: settings.telegram_wallet_address
      });
      setLoaded(true);
    }
  }, [settings, loaded]);

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => { const v = e.target.value; setForm((f) => ({ ...f, [k]: v })); };
  const save = async () => {
    if (form.margin.trim() === "" || Number.isNaN(Number(form.margin))) return toast("Enter a default margin, for example 20", "error");
    setSaving(true);
    try {
      await post("/api/admin/settings", {
        default_margin_percent: Number(form.margin), default_markup_cents: Number(form.markup || 0),
        bybit_address: form.bybit.trim(), telegram_wallet_address: form.telegram.trim()
      });
      toast("Settings saved");
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : "Request failed", "error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="card space-y-4 p-5">
        <div><h2 className="text-[17px] font-bold">Pricing defaults</h2><p className="mt-1 text-[13px] text-muted">Applied to every plan that doesn’t have its own margin.</p></div>
        <AdField label="Default margin (%)">
          <input className="input num" inputMode="decimal" value={form.margin} onChange={set("margin")} placeholder="20" />
        </AdField>
        <AdField label="Flat markup per plan (cents, optional)">
          <input className="input num" inputMode="numeric" value={form.markup} onChange={set("markup")} placeholder="0" />
        </AdField>
        <p className="text-[12px] leading-relaxed text-muted">Customers see only the final price. Supplier cost and your profit are visible to admins only.</p>
      </section>

      <section className="card space-y-4 p-5">
        <div><h2 className="text-[17px] font-bold">Payment addresses</h2><p className="mt-1 text-[13px] text-muted">Shown to customers when they top up. Leave one blank to switch that method off.</p></div>
        <AdField label="Bybit UID">
          <input className="input" value={form.bybit} onChange={set("bybit")} placeholder="Bybit UID" />
        </AdField>
        <AdField label="Telegram Wallet address">
          <input className="input" value={form.telegram} onChange={set("telegram")} placeholder="Telegram Wallet address" />
        </AdField>
        <p className="text-[12px] leading-relaxed text-muted">Double-check these before saving. Customers send money to exactly what is shown here.</p>
      </section>

      <div className="xl:col-span-2">
        <Button loading={saving} onClick={save}>Save settings</Button>
      </div>
    </div>
  );
}

