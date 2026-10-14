import { useCallback, useEffect, useState } from "react";
import { BottomNav, Header, type Tab } from "./components/Chrome";
import { Sheet, ToastProvider } from "./components/ui";
import { useBackButton } from "./hooks/useBackButton";
import { useResource } from "./hooks/useResource";
import { useTheme } from "./hooks/useTheme";
import { request } from "./lib/api";
import { tg } from "./lib/telegram";
import type { Me, Order, Product, Topup } from "./lib/types";
import { Home } from "./pages/Home";
import { Orders } from "./pages/Orders";
import { Profile } from "./pages/Profile";
import { Wallet } from "./pages/Wallet";
import { InfoSheet, SuccessSheet } from "./sheets/InfoSheets";
import { PaymentSheet } from "./sheets/PaymentSheet";
import { ProductSheet } from "./sheets/ProductSheet";
import { TopUpSheet, type TopupCreated } from "./sheets/TopUpSheet";

type SheetState =
  | { type: "topup" }
  | { type: "payment"; data: TopupCreated }
  | { type: "submitted" }
  | { type: "product"; product: Product }
  | { type: "purchased"; id: string }
  | { type: "info"; kind: "help" | "safety" };

export default function App() {
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const me = useResource(() => request<Me>("/api/me"));
  const products = useResource(() => request<Product[]>("/api/products"));
  const orders = useResource(() => request<Order[]>("/api/orders"), false);
  const topups = useResource(() => request<Topup[]>("/api/topups"), false);

  useEffect(() => {
    if (tab === "wallet") { void topups.reload(); void me.reload(); }
    if (tab === "orders") void orders.reload();
    if (tab === "profile") void me.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const closeSheet = useCallback(() => setSheet(null), []);
  const go = useCallback((t: Tab) => { setTab(t); setSheet(null); window.scrollTo({ top: 0, behavior: "smooth" }); }, []);
  useBackButton(sheet !== null || tab !== "home", () => (sheet ? closeSheet() : go("home")));

  const openTopup = () => setSheet({ type: "topup" });
  const openHelp = () => {
    const username = (window as unknown as { FLUX_SUPPORT_USERNAME?: string }).FLUX_SUPPORT_USERNAME;
    if (username && tg?.openTelegramLink) tg.openTelegramLink(`https://t.me/${username}`);
    else setSheet({ type: "info", kind: "help" });
  };

  return (
    <ToastProvider>
      <div className="mx-auto min-h-dvh max-w-2xl px-5 pb-32">
        <Header name={me.data?.first_name} onHome={() => go("home")} onProfile={() => go("profile")} />
        <main key={tab}>
          {tab === "home" && (
            <Home
              me={me.data} meLoading={me.loading}
              products={products.data} productsLoading={products.loading} productsError={products.error}
              onBuy={(product) => setSheet({ type: "product", product })}
              onTopup={openTopup} onOrders={() => go("orders")} onHelp={openHelp} onRetry={products.reload}
            />
          )}
          {tab === "wallet" && <Wallet me={me.data} meLoading={me.loading} topups={topups.data} loading={topups.loading} error={topups.error} onTopup={openTopup} onRefresh={topups.reload} />}
          {tab === "orders" && <Orders orders={orders.data} loading={orders.loading} error={orders.error} onRefresh={orders.reload} onExplore={() => go("home")} />}
          {tab === "profile" && <Profile me={me.data} mode={theme.mode} onMode={theme.setMode} go={go} onHelp={openHelp} onSafety={() => setSheet({ type: "info", kind: "safety" })} />}
        </main>
      </div>
      <BottomNav tab={tab} onChange={go} />

      {sheet && (
        <Sheet onClose={closeSheet}>
          {sheet.type === "topup" && <TopUpSheet onCreated={(data) => { setSheet({ type: "payment", data }); void topups.reload(); }} />}
          {sheet.type === "payment" && <PaymentSheet data={sheet.data} onSubmitted={() => { setSheet({ type: "submitted" }); void topups.reload(); }} />}
          {sheet.type === "submitted" && <SuccessSheet title="Sent for review" body="Your balance updates once an administrator confirms the funds arrived." cta="Done" onDone={() => go("wallet")} />}
          {sheet.type === "product" && (
            <ProductSheet
              product={sheet.product} me={me.data} onTopup={openTopup}
              onPurchased={(id) => { setSheet({ type: "purchased", id }); void me.reload(); void orders.reload(); }}
            />
          )}
          {sheet.type === "purchased" && <SuccessSheet title="Order placed" body={`Order ${sheet.id} was recorded and is waiting for review.`} cta="View orders" onDone={() => go("orders")} />}
          {sheet.type === "info" && <InfoSheet kind={sheet.kind} onClose={closeSheet} />}
        </Sheet>
      )}
    </ToastProvider>
  );
}
