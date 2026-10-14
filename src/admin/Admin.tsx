import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Activity, AlertTriangle, Check, ChevronRight, Clock3, LayoutDashboard, Megaphone, Moon, Package, RefreshCw,
  Search, ShieldCheck, Sun, Users, Wallet, X, type LucideIcon
} from "lucide-react";
import { BrandMark } from "../components/Chrome";
import { BRAND } from "../lib/brand";
import { Button, Empty, StatusPill, ToastProvider, useToast } from "../components/ui";
import { useTheme } from "../hooks/useTheme";
import { post, request } from "../lib/api";
import { confirmAction } from "../lib/telegram";
import { dateTime, money, titleCase } from "../lib/format";
import type { AdminAd, AdminOrder, AdminOverview, AdminTopup, AdminUser } from "../lib/types";

type Page = "overview" | "topups" | "orders" | "customers" | "ads";
const NAV: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "topups", label: "Top-ups", icon: Wallet },
  { id: "orders", label: "Orders", icon: Package },
  { id: "customers", label: "Customers", icon: Users },
  { id: "ads", label: "Ads", icon: Megaphone }
];
const TITLES: Record<Page, [string, string]> = {
  overview: ["Overview", "A live snapshot of your store."],
  topups: ["Top-ups", "Review requests only after checking payment receipt."],
  orders: ["Orders", "Update fulfilment status and handle eligible refunds."],
  customers: ["Customers", "Search registered customer accounts."],
  ads: ["Ads", "Publish sponsored placements for the home and shop pages."]
};

export default function Admin() {
  return <ToastProvider><Console /></ToastProvider>;
}

function Console() {
  const toast = useToast();
  const theme = useTheme();
  const [page, setPage] = useState<Page>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [topups, setTopups] = useState<AdminTopup[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [ads, setAds] = useState<AdminAd[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acting, setActing] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setOverview(await request<AdminOverview>("/api/admin/overview"));
      if (page === "topups") setTopups(await request<AdminTopup[]>("/api/admin/topups"));
      if (page === "orders") setOrders(await request<AdminOrder[]>("/api/admin/orders"));
      if (page === "customers") setUsers(await request<AdminUser[]>("/api/admin/users"));
      if (page === "ads") setAds(await request<AdminAd[]>("/api/admin/ads"));
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

  return (
    <div className="mx-auto min-h-dvh max-w-7xl px-4 pb-12 sm:px-7">
      <header className="sticky top-0 z-20 -mx-4 flex h-16 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-xl sm:-mx-7 sm:px-7">
        <a href="/" className="flex items-center gap-2.5"><BrandMark size={32} /><span className="text-[16px] font-semibold tracking-tight">{BRAND}</span><span className="rounded-full bg-fill px-2.5 py-0.5 text-[12px] font-semibold text-muted">Operations</span></a>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" aria-label="Toggle theme" onClick={() => theme.setMode(theme.resolved === "dark" ? "light" : "dark")}>{theme.resolved === "dark" ? <Sun size={16} /> : <Moon size={16} />}</Button>
          <Button variant="secondary" size="sm" aria-label="Refresh" onClick={load}><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></Button>
        </div>
      </header>

      <div className="grid gap-7 pt-6 md:grid-cols-[210px_minmax(0,1fr)]">
        <aside>
          <nav className="scroll-x -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => { setPage(id); setSearch(""); }} className={`flex shrink-0 items-center gap-3 rounded-full px-4 py-2.5 text-[14px] font-semibold transition md:rounded-xl ${page === id ? "bg-brand-soft text-brand" : "text-muted hover:bg-fill hover:text-ink"}`}>
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

        <main className="min-w-0 animate-rise" key={page}>
          {error && (
            <div className="mb-5 flex gap-3 rounded-2xl bg-down/10 p-4 text-[14px] text-down">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div><b>Couldn’t load admin data</b><p className="mt-1 opacity-90">{error}. Make sure this Telegram account is listed in ADMIN_TELEGRAM_IDS.</p></div>
            </div>
          )}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div><h1 className="text-[32px] font-bold tracking-tight">{title}</h1><p className="mt-1 text-[15px] text-muted">{subtitle}</p></div>
            {page !== "overview" && page !== "ads" && <span className="text-[13px] text-muted">{count} records · latest 100</span>}
          </div>

          {page === "overview" && <OverviewPanel o={overview} go={setPage} />}
          {page === "ads" && <AdsPanel ads={ads} reload={load} />}
          {page !== "overview" && page !== "ads" && (
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
                      <Cell title={titleCase(o.product_id || "")} sub={money(o.price)} capitalize />
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
    </div>
  );
}

function OverviewPanel({ o, go }: { o: AdminOverview | null; go: (p: Page) => void }) {
  const stats: [LucideIcon, string, number | undefined][] = [
    [Users, "Registered users", o?.users], [Package, "Total orders", o?.orders],
    [Clock3, "Pending top-ups", o?.pending_topups], [Activity, "Orders to review", o?.pending_orders]
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map(([Icon, label, value]) => (
          <div key={label} className="card p-5">
            <span className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-fill"><Icon size={18} /></span>
            <p className="text-[13px] text-muted">{label}</p>
            <b className="num mt-0.5 block text-[32px] font-bold leading-tight">{value ?? "—"}</b>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-[17px] font-bold">Needs attention</h2>
          <p className="mb-2 text-[13px] text-muted">Action queue</p>
          {([["topups", Wallet, "Review top-ups", "Verify incoming transfers", o?.pending_topups], ["orders", Package, "Review orders", "Update status or issue refunds", o?.pending_orders]] as const).map(([id, Icon, t, s, n]) => (
            <button key={id} onClick={() => go(id)} className="flex w-full items-center gap-3.5 border-t border-line py-3.5 text-left first:border-0">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand"><Icon size={18} /></span>
              <span className="flex-1"><b className="block text-[15px]">{t}</b><span className="text-[13px] text-muted">{s}</span></span>
              <b className="num text-[17px]">{n ?? "—"}</b><ChevronRight size={18} className="text-muted" />
            </button>
          ))}
        </section>
        <section className="card p-5">
          <h2 className="text-[17px] font-bold">Wallet position</h2>
          <p className="text-[13px] text-muted">Current customer wallet liabilities</p>
          <b className="num mt-4 block text-[40px] font-bold leading-none">{money(o?.wallet_liabilities)}</b>
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[13px] text-muted">Approved top-ups (lifetime)</p>
            <b className="num text-[20px]">{money(o?.approved_topups)}</b>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">Operational totals, not a bank reconciliation. Match credits and refunds against your payment records.</p>
        </section>
      </div>
    </>
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
const Row = ({ cols, children }: { cols: string; children: ReactNode }) => <div className={`grid gap-3 px-5 py-4 md:items-center ${cols}`}>{children}</div>;
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
          <div className="grid grid-cols-2 gap-3">
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

