import { useCallback, useEffect, useState } from "react";
import { BottomNav, Header, type Tab } from "./components/Chrome";
import { Sheet, ToastProvider } from "./components/ui";
import { useBackButton } from "./hooks/useBackButton";
import { useResource } from "./hooks/useResource";
import { useTheme } from "./hooks/useTheme";
import { request } from "./lib/api";

import type { FeedSection, Me, Order, Product, Topup } from "./lib/types";
import { Home } from "./pages/Home";
import { Orders } from "./pages/Orders";
import { Shop } from "./pages/Shop";
import { ProductPage } from "./pages/ProductPage";
import { Profile } from "./pages/Profile";
import { Wallet } from "./pages/Wallet";
import { InfoSheet, SuccessSheet } from "./sheets/InfoSheets";
import { SupportSheet } from "./sheets/SupportSheet";
import { PaymentSheet } from "./sheets/PaymentSheet";
import { TopUpSheet, type TopupCreated } from "./sheets/TopUpSheet";

type SheetState =
  | { type: "topup" }
  | { type: "payment"; data: TopupCreated }
  | { type: "submitted" }
  | { type: "purchased"; id: string }
  | { type: "info"; kind: "safety" }
  | { type: "support" };

export default function App() {
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [product, setProduct] = useState<Product | null>(null);

  const me = useResource(() => request<Me>("/api/me"));
  const products = useResource(() => request<Product[]>("/api/products"));
  const feed = useResource(() => request<FeedSection[]>("/api/feed"));
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
  const closeProduct = useCallback(() => setProduct(null), []);
  useBackButton(sheet !== null || product !== null || tab !== "home", () => {
    if (sheet) closeSheet(); else if (product) closeProduct(); else go("home");
  });
  const openProduct = (p: Product) => { setSheet(null); setProduct(p); window.scrollTo({ top: 0 }); };

  const openTopup = () => setSheet({ type: "topup" });
  const openHelp = () => setSheet({ type: "support" });

  return (
    <ToastProvider>
      <div className="app-shell mx-auto max-w-2xl px-5 pb-[calc(112px+env(safe-area-inset-bottom))]">
        {!product && <Header name={me.data?.first_name} onProfile={() => go("profile")} />}
        {product && (
          <ProductPage
            product={product} me={me.data} onBack={closeProduct} onTopup={openTopup} onSupport={openHelp}
            onPurchased={(id) => { setProduct(null); setSheet({ type: "purchased", id }); void me.reload(); void orders.reload(); }}
          />
        )}
        {!product && <main key={tab}>
          {tab === "home" && (
            <Home
              me={me.data} meLoading={me.loading}
              feed={feed.data} feedLoading={feed.loading} feedError={feed.error}
              onBuy={openProduct}
              onTopup={openTopup} onShop={() => go("shop")} onHelp={openHelp} onRetry={feed.reload}
            />
          )}
          {tab === "shop" && (
            <Shop
              products={products.data} productsLoading={products.loading} productsError={products.error}
              onBuy={openProduct} onRetry={products.reload}
            />
          )}
          {tab === "wallet" && <Wallet me={me.data} meLoading={me.loading} topups={topups.data} loading={topups.loading} error={topups.error} onTopup={openTopup} onRefresh={topups.reload} />}
          {tab === "orders" && <Orders orders={orders.data} loading={orders.loading} error={orders.error} onRefresh={orders.reload} onExplore={() => go("home")} />}
          {tab === "profile" && <Profile me={me.data} mode={theme.mode} onMode={theme.setMode} go={go} onHelp={openHelp} onSafety={() => setSheet({ type: "info", kind: "safety" })} />}
        </main>}
      </div>
      {!product && <BottomNav tab={tab} onChange={go} />}

      {sheet && (
        <Sheet onClose={closeSheet}>
          {sheet.type === "topup" && <TopUpSheet onCreated={(data) => { setSheet({ type: "payment", data }); void topups.reload(); }} />}
          {sheet.type === "payment" && <PaymentSheet data={sheet.data} onSubmitted={() => { setSheet({ type: "submitted" }); void topups.reload(); }} />}
          {sheet.type === "submitted" && <SuccessSheet title="Sent for review" body="Your balance updates once an administrator confirms the funds arrived." cta="Done" onDone={() => go("wallet")} />}
          {sheet.type === "purchased" && <SuccessSheet title="Order placed" body={`Order ${sheet.id} is being processed. Your access details will appear under Orders once it is delivered.`} cta="View orders" onDone={() => go("orders")} />}
          {sheet.type === "info" && <InfoSheet kind={sheet.kind} onClose={closeSheet} />}
          {sheet.type === "support" && <SupportSheet />}
        </Sheet>
      )}
    </ToastProvider>
  );
}
